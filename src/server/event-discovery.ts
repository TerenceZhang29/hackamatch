import "server-only";
import { track } from "@/lib/analytics";
import { getConfig } from "@/lib/config";
import {
  SOURCES,
  mlhNextPage,
  newListings,
  parseSource,
  sourceUrl,
  type Known,
  type Listing,
  type Source,
} from "@/lib/event-sources";
import type { LlmUsage } from "@/lib/llm/client";
import { EVENT_PROMPT_VERSION } from "@/lib/llm/prompts";
import { localDateString } from "@/lib/time";
import { draftEventFromText } from "./event-autofill";
import { fetchEventPageText, fetchPublicPage, type Resolve } from "./event-page";
import {
  insertSuggestions,
  knownEvents,
  notifyAdminsOfSuggestions,
  type EventSuggestion,
} from "./event-suggestions";

/**
 * The weekly hackathon discovery job (docs/plans/event-discovery.md). Reads
 * each source's list, keeps the upcoming ones nobody has seen, drafts each
 * from its own page with the "Fill from event site" model call, stores them
 * as suggestions and emails the admins. It never creates an event: an admin
 * reviews each suggestion in /admin/events.
 */

/** At most this many model calls a run, to cap the cost. */
export const MAX_DRAFTS = 15;
/** Drafts run a few at a time, so a run fits in the route's 300 seconds. */
const DRAFT_CONCURRENCY = 3;
/** No new draft starts after this long; the rest are stored without one. */
const DRAFT_BUDGET_MS = 200_000;
/** MLH shows about 24 events a page; a season has fewer than 120. */
const MAX_MLH_PAGES = 5;

export interface SourceResult {
  ok: boolean;
  /** Hackathons listed, after the source's own filters (place, audience). */
  listed: number;
  error?: string;
}

export interface DiscoveryResult {
  today: string;
  sources: Record<Source, SourceResult>;
  /** Upcoming, within 6 months, and not already an event or a suggestion. */
  fresh: Listing[];
  drafted: number;
  stored: number;
  emailed: number;
  usage: { model: string | null; inputTokens: number; outputTokens: number; calls: number };
}

export interface DiscoveryDeps {
  fetch?: typeof fetch;
  resolve?: Resolve;
  now?: Date;
  draft?: typeof draftEventFromText;
  known?: () => Promise<Known[]>;
  store?: typeof insertSuggestions;
  notify?: (found: readonly EventSuggestion[]) => Promise<number>;
  track?: typeof track;
}

/** Reads one source's list; MLH over several pages. */
async function readSource(source: Source, today: string, deps: DiscoveryDeps): Promise<Listing[]> {
  const fetchDeps = { fetch: deps.fetch, resolve: deps.resolve };
  const options =
    source === "devpost" ? { accept: "application/json", types: /application\/json/ } : {};
  const first = sourceUrl(source, today);
  if (source !== "mlh") {
    const page = await fetchPublicPage(first, fetchDeps, options);
    return parseSource(source, page.body);
  }
  const listings: Listing[] = [];
  let next: number | null = 1;
  for (let n = 0; next !== null && n < MAX_MLH_PAGES; n++) {
    const url: string = next === 1 ? first : `${first}?upcoming_page=${next}`;
    const page = await fetchPublicPage(url, fetchDeps, options);
    listings.push(...parseSource("mlh", page.body));
    next = mlhNextPage(page.body);
  }
  return listings;
}

/** Runs `work` over `items`, `limit` at a time, keeping the order of the results. */
async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await work(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * One run. With `dry`, it only reads the sources and reports what's new: no
 * model calls, nothing stored, no email.
 */
export async function discoverEvents(
  options: { dry?: boolean } = {},
  deps: DiscoveryDeps = {},
): Promise<DiscoveryResult> {
  const started = Date.now();
  const today = localDateString(getConfig().APP_TIMEZONE, deps.now);
  const sources = {} as Record<Source, SourceResult>;
  const lists = await Promise.all(
    SOURCES.map(async (source) => {
      try {
        const listings = await readSource(source, today, deps);
        sources[source] = { ok: true, listed: listings.length };
        return listings;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`discoverEvents: ${source} couldn't be read`, message);
        sources[source] = { ok: false, listed: 0, error: message };
        return [];
      }
    }),
  );

  const fresh = newListings(lists.flat(), await (deps.known ?? knownEvents)(), today);
  const usage: DiscoveryResult["usage"] = {
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
  };
  const result: DiscoveryResult = {
    today,
    sources,
    fresh,
    drafted: 0,
    stored: 0,
    emailed: 0,
    usage,
  };
  if (options.dry) return result;

  const draft = deps.draft ?? draftEventFromText;
  let budget = MAX_DRAFTS;
  // Without a draft from the page, the list's own hints (if any) fill a little.
  const fallback = ({ hints, ...item }: Listing) => ({ ...item, draft: hints ?? null });
  const drafted = await mapLimited(fresh, DRAFT_CONCURRENCY, async (item) => {
    if (budget <= 0 || Date.now() - started > DRAFT_BUDGET_MS) return fallback(item);
    try {
      const page = await fetchEventPageText(item.url, { fetch: deps.fetch, resolve: deps.resolve });
      // A page that builds itself with JavaScript has almost no text: not worth a call.
      if (page.text.trim().length < 50 || budget <= 0) return fallback(item);
      budget--;
      usage.calls++;
      const values = await draft(
        page.text,
        today,
        (u: LlmUsage) => {
          usage.model = u.model;
          usage.inputTokens += u.inputTokens;
          usage.outputTokens += u.outputTokens;
        },
        [item.url, page.url],
      );
      result.drafted++;
      const { hints, ...rest } = item;
      return { ...rest, draft: { ...hints, ...values }, pageRead: true };
    } catch (error) {
      console.error(
        `discoverEvents: no draft for ${item.url}:`,
        error instanceof Error ? error.message : error,
      );
      return fallback(item);
    }
  });

  const stored = await (deps.store ?? insertSuggestions)(drafted);
  result.stored = stored.length;
  result.emailed = await (deps.notify ?? notifyAdminsOfSuggestions)(stored);

  await (deps.track ?? track)("events_discovered", {
    sources: Object.fromEntries(
      Object.entries(sources).map(([s, r]) => [s, r.ok ? r.listed : `error: ${r.error}`]),
    ),
    fresh: fresh.length,
    drafted: result.drafted,
    stored: result.stored,
    emailed: result.emailed,
    prompt_version: EVENT_PROMPT_VERSION,
    model: usage.model,
    calls: usage.calls,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    ms: Date.now() - started,
  });
  return result;
}

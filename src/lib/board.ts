import { slugsOf } from "@/lib/taxonomy/skills";

/** Parsing and building the public board's URL state (tab, filters, page size). */

export const BOARD_TABS = ["ideas", "people"] as const;
export type BoardTab = (typeof BOARD_TABS)[number];

export const BOARD_INTENTS = ["hackathon", "side_project", "cofounder"] as const;
export type BoardIntent = (typeof BOARD_INTENTS)[number];

export const PAGE_SIZE = 20;
/** The URL parameters the board reads. */
export const BOARD_PARAM_KEYS = ["tab", "event", "domain", "skill", "intent", "n", "view"] as const;
export const MAX_SHOWN = 100;
/** Cards per list on an event page; "Show more" adds this many. */
export const EVENT_PAGE_SIZE = 12;
/** Cards per event list a visitor sees (signed out or not onboarded) before a sign-in prompt. */
export const VISITOR_LIMIT = 3;

export interface BoardFilters {
  event: string | null;
  domain: string | null;
  skill: string | null;
  intent: BoardIntent | null;
}

export interface BoardState {
  tab: BoardTab;
  filters: BoardFilters;
  /** How many cards to show; "Load more" adds a page. */
  shown: number;
  /** "list" keeps members on the list instead of the one-card deck at `/`. */
  view: "list" | null;
}

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() || null;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DOMAINS = new Set(slugsOf("domains"));
const SKILLS = new Set([...slugsOf("skills"), ...slugsOf("stack")]);

/** A "show N" count from the URL, rounded up to whole pages, from one page up to MAX_SHOWN. */
export function parseShown(value: string | string[] | undefined, pageSize: number): number {
  const requested = Number(first(value) ?? pageSize);
  return Number.isFinite(requested)
    ? Math.min(MAX_SHOWN, Math.max(pageSize, Math.ceil(requested / pageSize) * pageSize))
    : pageSize;
}

/** Reads the board state from URL search params; anything unknown is ignored. */
export function parseBoardParams(params: Params): BoardState {
  const tab = first(params.tab) === "people" ? "people" : "ideas";
  const event = first(params.event);
  const domain = first(params.domain);
  const skill = first(params.skill);
  const intent = first(params.intent);
  const shown = parseShown(params.n, PAGE_SIZE);

  return {
    tab,
    filters: {
      event: event && SLUG.test(event) && event.length <= 80 ? event : null,
      domain: domain && DOMAINS.has(domain) ? domain : null,
      skill: skill && SKILLS.has(skill) ? skill : null,
      intent: (BOARD_INTENTS as readonly string[]).includes(intent ?? "")
        ? (intent as BoardIntent)
        : null,
    },
    shown,
    view: first(params.view) === "list" ? "list" : null,
  };
}

/**
 * Whether a member's visit to `/` is for the one-card deck: no list view asked
 * for and no list-only parameters (tabs, filters other than the event, paging),
 * so shared board links still open the list.
 */
export function wantsDeck(params: Params): boolean {
  if (first(params.view) === "list") return false;
  return !(["tab", "domain", "skill", "intent", "n"] as const).some((key) => first(params[key]));
}

/** The board URL for a state; defaults are left out so URLs stay short and shareable. */
export function boardHref(state: BoardState): string {
  const params = new URLSearchParams();
  if (state.tab !== "ideas") params.set("tab", state.tab);
  for (const [key, value] of Object.entries(state.filters)) {
    if (value) params.set(key, value);
  }
  if (state.shown > PAGE_SIZE) params.set("n", String(state.shown));
  if (state.view) params.set("view", state.view);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function hasFilters(filters: BoardFilters): boolean {
  return Object.values(filters).some(Boolean);
}

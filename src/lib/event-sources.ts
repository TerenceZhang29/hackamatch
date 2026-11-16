import type { EventFormat } from "@/lib/event-details";

/**
 * Reading hackathon lists for the weekly discovery job
 * (docs/plans/event-discovery.md). Each source publishes its list as data
 * (MLH: the page's embedded JSON; Devpost: its JSON API; Luma: the page's
 * schema.org data), so the list is read in code, with no model call. Pure
 * functions, so they are tested on saved copies of each page.
 */

export const SOURCES = ["mlh", "devpost", "luma"] as const;
export type Source = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<Source, string> = {
  mlh: "MLH",
  devpost: "Devpost",
  luma: "Luma",
};

/** Where each source's list is read from. The MLH season changes each July. */
export function sourceUrl(source: Source, today: string): string {
  switch (source) {
    case "mlh": {
      // MLH names a season after the year it ends in; seasons start in July.
      const [year = 0, month = 1] = today.split("-").map(Number);
      return `https://www.mlh.com/seasons/${month >= 7 ? year + 1 : year}/events`;
    }
    case "devpost":
      return "https://devpost.com/api/hackathons?search=new%20york&status[]=upcoming&status[]=open";
    case "luma":
      return "https://luma.com/nyc";
  }
}

/** One hackathon as a source lists it. */
export interface Listing {
  source: Source;
  name: string;
  /** YYYY-MM-DD, as the source shows it. */
  startDate: string;
  endDate: string;
  url: string;
  venue: string | null;
  format: EventFormat | null;
  /**
   * Event-form values the list itself gives (Devpost: host and prize total),
   * used when the event's own page can't be read.
   */
  hints?: { host?: string; prizeTotal?: string };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * The calendar date an ISO timestamp is written in: "2027-02-27T01:11:11Z"
 * is Feb 27. That is the date the sources themselves show (MLH lists that
 * one as "FEB 27"; Luma writes New York times with their offset).
 */
export function datePart(timestamp: unknown): string | null {
  if (typeof timestamp !== "string") return null;
  const date = timestamp.slice(0, 10);
  return ISO_DATE.test(date) && !Number.isNaN(new Date(timestamp).getTime()) ? date : null;
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.replace(/\s+/g, " ").trim()
    ? value.replace(/\s+/g, " ").trim()
    : null;

function httpsUrl(value: unknown, base?: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function listing(input: Omit<Listing, "name" | "url"> & { name: unknown; url: unknown }) {
  const name = text(input.name)?.slice(0, 200);
  const url = httpsUrl(input.url);
  if (!name || !url || url.length > 500) return null;
  if (!ISO_DATE.test(input.startDate) || !ISO_DATE.test(input.endDate)) return null;
  const endDate = input.endDate < input.startDate ? input.startDate : input.endDate;
  return { ...input, name, url, endDate, venue: input.venue?.slice(0, 200) ?? null } as Listing;
}

// MLH -------------------------------------------------------------------------

/** States near New York City, as MLH writes them. In-person MLH events elsewhere are left out. */
const NEAR_NYC_STATES = new Set(["ny", "new york", "nj", "new jersey", "ct", "connecticut"]);

interface MlhEvent {
  name?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  url?: unknown;
  websiteUrl?: unknown;
  location?: unknown;
  formatType?: unknown;
  venueAddress?: { state?: unknown; country?: unknown } | null;
  customFields?: { underserved_types?: unknown } | null;
}

interface MlhPage {
  props?: { upcomingEvents?: MlhEvent[] };
  scrollProps?: { upcomingEvents?: { nextPage?: unknown } };
}

function mlhPage(html: string): MlhPage {
  const json = /<script[^>]*data-page="app"[^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
  if (!json) throw new Error("MLH: no event data on the page");
  return JSON.parse(json) as MlhPage;
}

/** MLH shows about 24 upcoming events a page; the next page's number, or null on the last. */
export function mlhNextPage(html: string): number | null {
  const next = mlhPage(html).scrollProps?.upcomingEvents?.nextPage;
  return typeof next === "number" && next > 1 ? next : null;
}

/**
 * MLH's season page embeds its events as JSON (`<script data-page="app">`).
 * Keeps upcoming events that are online, or in person near New York City,
 * and drops high-school-only ones.
 */
export function parseMlh(html: string): Listing[] {
  const events = mlhPage(html).props?.upcomingEvents;
  if (!Array.isArray(events)) throw new Error("MLH: no upcomingEvents in the page data");
  return events.flatMap((event) => {
    const kind = String(event.formatType ?? "");
    const format: EventFormat = kind.startsWith("hybrid")
      ? "hybrid"
      : kind === "physical"
        ? "in_person"
        : "online";
    const state = String(event.venueAddress?.state ?? "")
      .trim()
      .toLowerCase();
    const country = String(event.venueAddress?.country ?? "").toUpperCase();
    const near = country === "US" && NEAR_NYC_STATES.has(state);
    if (format !== "online" && !near) return [];
    const audience = event.customFields?.underserved_types;
    if (Array.isArray(audience) && audience.some((a) => /high school/i.test(String(a)))) return [];
    const startDate = datePart(event.startsAt);
    const endDate = datePart(event.endsAt) ?? startDate;
    if (!startDate || !endDate) return [];
    const result = listing({
      source: "mlh",
      name: event.name,
      startDate,
      endDate,
      url: httpsUrl(event.websiteUrl) ?? httpsUrl(event.url, "https://www.mlh.com"),
      venue: format === "online" ? "Online" : text(event.location),
      format,
    });
    return result ? [result] : [];
  });
}

// Devpost ---------------------------------------------------------------------

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Devpost's date ranges: "Nov 18, 2026", "Jan 30 - 31, 2027",
 * "May 31 - Jun 17, 2027" or "Dec 30, 2026 - Jan 02, 2027".
 */
export function parseDevpostDates(value: string): { startDate: string; endDate: string } | null {
  const part = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2})(?:, (\d{4}))?$/;
  const [left = "", right] = value.trim().split(/\s+[-–]\s+/);
  const start = part.exec(left);
  if (!start) return null;
  const startMonth = MONTHS.indexOf(start[1]!.toLowerCase() as (typeof MONTHS)[number]);
  if (startMonth < 0) return null;

  let endMonth = startMonth;
  let endDay: number;
  let endYear: number | null;
  if (right === undefined) {
    endDay = Number(start[2]);
    endYear = start[3] ? Number(start[3]) : null;
  } else {
    const dayOnly = /^(\d{1,2}), (\d{4})$/.exec(right);
    const full = part.exec(right);
    if (dayOnly) {
      endDay = Number(dayOnly[1]);
      endYear = Number(dayOnly[2]);
    } else if (full) {
      endMonth = MONTHS.indexOf(full[1]!.toLowerCase() as (typeof MONTHS)[number]);
      if (endMonth < 0) return null;
      endDay = Number(full[2]);
      endYear = full[3] ? Number(full[3]) : null;
    } else return null;
  }
  if (endYear === null) return null;
  const startYear = start[3] ? Number(start[3]) : startMonth > endMonth ? endYear - 1 : endYear;
  return {
    startDate: `${startYear}-${pad(startMonth + 1)}-${pad(Number(start[2]))}`,
    endDate: `${endYear}-${pad(endMonth + 1)}-${pad(endDay)}`,
  };
}

interface DevpostHackathon {
  title?: unknown;
  url?: unknown;
  submission_period_dates?: unknown;
  displayed_location?: { location?: unknown } | null;
  invite_only?: unknown;
  organization_name?: unknown;
  prize_amount?: unknown;
}

/** "$<span data-currency-value>12,500</span>" → "$12,500"; nothing for $0 or another currency. */
function devpostPrize(value: unknown): string | undefined {
  // US dollars only: other currencies ("$CAD 10,000") are left for the admin.
  const amount = text(String(value ?? "").replace(/<[^>]*>/g, ""));
  if (!amount || !/^\$[\d,]+$/.test(amount)) return undefined;
  return Number(amount.replace(/[$,]/g, "")) > 0 ? amount : undefined;
}

/** Devpost's hackathon API, searched for New York. Invite-only ones are left out. */
export function parseDevpost(body: string): Listing[] {
  const data = JSON.parse(body) as { hackathons?: DevpostHackathon[] };
  if (!Array.isArray(data.hackathons)) throw new Error("Devpost: no hackathons in the response");
  return data.hackathons.flatMap((h) => {
    if (h.invite_only === true) return [];
    const dates = parseDevpostDates(String(h.submission_period_dates ?? ""));
    if (!dates) return [];
    const where = text(h.displayed_location?.location);
    const online = where !== null && /\bonline\b/i.test(where);
    const onlineOnly = online && /^online$/i.test(where!);
    const result = listing({
      source: "devpost",
      name: h.title,
      ...dates,
      url: h.url,
      venue: where,
      format: onlineOnly ? "online" : online ? "hybrid" : "in_person",
    });
    const host = text(h.organization_name)?.slice(0, 120);
    const prizeTotal = devpostPrize(h.prize_amount);
    if (result && (host || prizeTotal)) {
      result.hints = { ...(host ? { host } : {}), ...(prizeTotal ? { prizeTotal } : {}) };
    }
    return result ? [result] : [];
  });
}

// Luma ------------------------------------------------------------------------

/** Names that say it's a hackathon. Luma's NYC page lists every kind of event. */
const HACKATHON_NAME = /hack(?:athon|-a-thon|s\b|\s*night|\s*day)|buildathon|build-a-thon/i;

interface LdEvent {
  "@type"?: unknown;
  name?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  url?: unknown;
  eventAttendanceMode?: unknown;
  location?: { name?: unknown; address?: unknown } | null;
}

function ldItems(value: unknown): LdEvent[] {
  if (Array.isArray(value)) return value.flatMap(ldItems);
  if (!value || typeof value !== "object") return [];
  const node = value as Record<string, unknown>;
  if (node["@type"] === "Event") return [node as LdEvent];
  if (node["@type"] === "ItemList" && Array.isArray(node.itemListElement)) {
    return node.itemListElement.flatMap((item) =>
      ldItems((item as { item?: unknown } | null)?.item ?? item),
    );
  }
  return [];
}

/** Luma's New York page: its schema.org event list, keeping events named as hackathons. */
export function parseLuma(html: string): Listing[] {
  const blocks = [
    ...html.matchAll(
      /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  const events = blocks.flatMap((match) => {
    try {
      return ldItems(JSON.parse(match[1]!));
    } catch {
      return [];
    }
  });
  return events.flatMap((event) => {
    if (!HACKATHON_NAME.test(String(event.name ?? ""))) return [];
    const startDate = datePart(event.startDate);
    const endDate = datePart(event.endDate) ?? startDate;
    if (!startDate || !endDate) return [];
    const online = /online/i.test(String(event.eventAttendanceMode ?? ""));
    const address = event.location?.address;
    const place =
      text(event.location?.name) ??
      (typeof address === "string"
        ? text(address)
        : text((address as { addressLocality?: unknown } | null)?.addressLocality));
    const result = listing({
      source: "luma",
      name: event.name,
      startDate,
      endDate,
      url: event.url,
      venue: online ? "Online" : place,
      format: online ? "online" : "in_person",
    });
    return result ? [result] : [];
  });
}

export function parseSource(source: Source, body: string): Listing[] {
  switch (source) {
    case "mlh":
      return parseMlh(body);
    case "devpost":
      return parseDevpost(body);
    case "luma":
      return parseLuma(body);
  }
}

// Which ones are new ------------------------------------------------------------

/** How far ahead suggestions reach: about 6 months (plan, open question 2). */
export const WINDOW_DAYS = 183;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Not ended, and starting within the window. */
export function inWindow(item: Pick<Listing, "startDate" | "endDate">, today: string): boolean {
  return item.endDate >= today && item.startDate <= addDays(today, WINDOW_DAYS);
}

/**
 * A link without its scheme, "www.", query, fragment or trailing slash, in
 * lower case, with lu.ma read as luma.com: the same page however it's written.
 */
export function urlKey(raw: string): string {
  try {
    const url = new URL(raw);
    const host = url.hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/^lu\.ma$/, "luma.com");
    return `${host}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** A name's words in lower case, without years or the words "the" and "hackathon". */
function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (word) => word && !/^(19|20)\d{2}$/.test(word) && word !== "the" && word !== "hackathon",
    );
}

/** A name in lower-case letters and digits, without years or the word "hackathon". */
export function nameKey(name: string): string {
  return nameWords(name).join("");
}

/**
 * Roughly the same name: equal once simplified ("Hack @ Brown" and
 * "Hack@Brown 2027"), or one's words all in the other ("HackPrinceton" and
 * "HackPrinceton Fall 2026"). Whole words only, so "Hacks" isn't "BostonHacks".
 */
export function sameName(a: string, b: string): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [fewer, more] = [nameWords(a), nameWords(b)].sort((p, q) => p.length - q.length) as [
    string[],
    string[],
  ];
  return fewer.join("").length >= 5 && fewer.every((word) => more.includes(word));
}

/** Something already known: an event, or an earlier suggestion of any status. */
export interface Known {
  name: string;
  startDate: string;
  url: string | null;
}

/** Whether a listing is already known: the same page, or a similar name on the same start date. */
export function isKnown(item: Listing, known: readonly Known[]): boolean {
  const key = urlKey(item.url);
  return known.some(
    (k) =>
      (k.url !== null && urlKey(k.url) === key) ||
      (k.startDate === item.startDate && sameName(k.name, item.name)),
  );
}

/**
 * The listings worth suggesting: in the window, not known, and each only once
 * (sources overlap), in date order.
 */
export function newListings(
  listings: readonly Listing[],
  known: readonly Known[],
  today: string,
): Listing[] {
  const picked: Listing[] = [];
  for (const item of [...listings].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    if (!inWindow(item, today)) continue;
    if (isKnown(item, known)) continue;
    if (
      isKnown(
        item,
        picked.map((p) => ({ ...p })),
      )
    )
      continue;
    picked.push(item);
  }
  return picked;
}

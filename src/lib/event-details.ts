import { z } from "zod";
import { displayLabel } from "@/lib/taxonomy/labels";
import { normalizeTag, tagKey } from "@/lib/taxonomy/normalize";
import { slugsOf } from "@/lib/taxonomy/skills";
import type { Enums } from "@/types/db";

/**
 * The event details people compare hackathons on (P1-25,
 * docs/plans/p1-25-event-details.md). One schema checks every write, from the
 * admin form and from the AI draft ("Fill from event site"). The list fields
 * are edited as one item per line ("1st place | $5,000"), so the form stays a
 * plain form and the draft only fills text boxes; parse* and format* convert.
 */

export type EventFormat = Enums<"event_format">;
export type EventLevel = Enums<"event_level">;
export type EventAdmission = Enums<"event_admission">;

export const FORMATS = ["in_person", "online", "hybrid"] as const satisfies readonly EventFormat[];
export const LEVELS = [
  "beginner",
  "intermediate",
  "advanced",
] as const satisfies readonly EventLevel[];
export const ADMISSIONS = [
  "open",
  "application",
  "first_come",
] as const satisfies readonly EventAdmission[];
export const PERKS = ["meals", "mentors", "sleep", "travel", "workshops", "swag"] as const;
export type Perk = (typeof PERKS)[number];

export const FORMAT_LABELS: Record<EventFormat, string> = {
  in_person: "In person",
  online: "Online",
  hybrid: "Hybrid",
};
export const LEVEL_LABELS: Record<EventLevel, string> = {
  beginner: "Beginner friendly",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
export const ADMISSION_LABELS: Record<EventAdmission, string> = {
  open: "Open to all who register",
  application: "They pick by application",
  first_come: "First come, first served",
};
export const PERK_LABELS: Record<Perk, string> = {
  meals: "Meals",
  mentors: "Mentors on site",
  sleep: "Place to sleep",
  travel: "Travel support",
  workshops: "Workshops",
  swag: "Swag",
};

export const LIMITS = {
  prizes: 12,
  tracks: 8,
  trackSkills: 6,
  judging: 10,
  schedule: 30,
} as const;

export interface Prize {
  label: string;
  amountCents: number | null;
  note: string | null;
}
export interface Track {
  name: string;
  description: string | null;
  /** Skill and stack slugs from the taxonomy, the same ones profiles use. */
  skills: string[];
}
export interface JudgingItem {
  criterion: string;
  weightPct: number | null;
}
export interface ScheduleItem {
  /** YYYY-MM-DD, or null when the event site gives only a time. */
  date: string | null;
  time: string | null;
  label: string;
}

const text = (max: number) => z.string().trim().min(1).max(max);
const maybeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

/** An https link, or null. Anything else (http, javascript:, garbage) is dropped. */
export function httpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && value.length <= 2048 ? url.toString() : null;
  } catch {
    return null;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const prizeSchema = z.object({
  label: text(80),
  amountCents: z.number().int().min(0).max(1_000_000_000).nullable(),
  note: maybeText(120),
});
export const trackSchema = z.object({
  name: text(60),
  description: maybeText(240),
  skills: z
    .array(z.string())
    .transform((skills) => toSkillSlugs(skills).slice(0, LIMITS.trackSkills)),
});
export const judgingSchema = z.object({
  criterion: text(80),
  weightPct: z.number().int().min(0).max(100).nullable(),
});
export const scheduleSchema = z.object({
  date: z
    .string()
    .regex(ISO_DATE)
    .nullish()
    .transform((v) => v ?? null),
  time: maybeText(20),
  label: text(100),
});

/** Every P1-25 field; null or empty means "not known" and the page hides it. */
export const eventDetailsSchema = z.object({
  format: z.enum(FORMATS).nullable(),
  lengthHours: z.number().int().min(1).max(400).nullable(),
  entryFeeCents: z.number().int().min(0).max(10_000_000).nullable(),
  openTo: maybeText(120),
  level: z.enum(LEVELS).nullable(),
  applyBy: z
    .string()
    .regex(ISO_DATE)
    .nullish()
    .transform((v) => v ?? null),
  applyUrl: z
    .string()
    .nullish()
    .transform((v) => httpsUrl(v)),
  admission: z.enum(ADMISSIONS).nullable(),
  capacity: z.number().int().min(1).max(100_000).nullable(),
  prizeTotalCents: z.number().int().min(0).max(1_000_000_000).nullable(),
  prizes: z.array(prizeSchema).max(LIMITS.prizes),
  tracks: z.array(trackSchema).max(LIMITS.tracks),
  tools: maybeText(300),
  judging: z.array(judgingSchema).max(LIMITS.judging),
  schedule: z.array(scheduleSchema).max(LIMITS.schedule),
  perks: z.array(z.enum(PERKS)).transform((perks) => [...new Set(perks)]),
  perkNotes: maybeText(300),
  chatUrl: z
    .string()
    .nullish()
    .transform((v) => httpsUrl(v)),
});
export type EventDetails = z.infer<typeof eventDetailsSchema>;

export const EMPTY_DETAILS: EventDetails = {
  format: null,
  lengthHours: null,
  entryFeeCents: null,
  openTo: null,
  level: null,
  applyBy: null,
  applyUrl: null,
  admission: null,
  capacity: null,
  prizeTotalCents: null,
  prizes: [],
  tracks: [],
  tools: null,
  judging: [],
  schedule: [],
  perks: [],
  perkNotes: null,
  chatUrl: null,
};

/** Skill slugs a track can use: the profile skills and stack. */
export function trackSkillSlugs(): string[] {
  return [...slugsOf("skills"), ...slugsOf("stack")];
}

const LABEL_INDEX = new Map(trackSkillSlugs().map((slug) => [tagKey(displayLabel(slug)), slug]));

/** Skill names (slugs, aliases or display labels) as slugs; unknown ones dropped, no duplicates. */
export function toSkillSlugs(names: readonly string[]): string[] {
  const slugs = new Set<string>();
  for (const name of names) {
    const slug =
      normalizeTag("skills", name) ?? normalizeTag("stack", name) ?? LABEL_INDEX.get(tagKey(name));
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}

// Money -------------------------------------------------------------------

/** "$12,000", "12000", "12k", "$1.5k" as cents; null when it isn't an amount. */
export function parseDollars(value: string): number | null {
  const match = /^\$?\s*([\d,]+(?:\.\d+)?)\s*(k)?$/i.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]!.replaceAll(",", "")) * (match[2] ? 1000 : 1);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

/** 500000 → "$5,000". */
export function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** 1200000 → "$12k", for list rows; under $1,000 in full. */
export function shortDollars(cents: number): string {
  const dollars = cents / 100;
  if (dollars < 1000) return formatDollars(cents);
  const k = dollars / 1000;
  return `$${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}

// One item per line -------------------------------------------------------

function lines(value: string): string[][] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|").map((part) => part.trim()));
}

/** "1st place | $5,000 | note": the amount and note are optional. */
export function parsePrizes(value: string): Prize[] {
  return lines(value).map(([label = "", amount = "", note = ""]) => ({
    label,
    amountCents: amount ? parseDollars(amount) : null,
    note: note || null,
  }));
}
export function formatPrizes(prizes: readonly Prize[]): string {
  return prizes
    .map((p) =>
      [p.label, p.amountCents === null ? "" : formatDollars(p.amountCents), p.note ?? ""]
        .join(" | ")
        .replace(/( \| )+$/, ""),
    )
    .join("\n");
}

/** "Name | description | ML, Backend": skills by name, comma-separated. */
export function parseTracks(value: string): Track[] {
  return lines(value).map(([name = "", description = "", skills = ""]) => ({
    name,
    description: description || null,
    skills: toSkillSlugs(skills.split(",").map((s) => s.trim())),
  }));
}
export function formatTracks(tracks: readonly Track[]): string {
  return tracks
    .map((t) =>
      [t.name, t.description ?? "", t.skills.map(displayLabel).join(", ")]
        .join(" | ")
        .replace(/( \| )+$/, ""),
    )
    .join("\n");
}

/** "Impact | 30%": the weight is optional. */
export function parseJudging(value: string): JudgingItem[] {
  return lines(value).map(([criterion = "", weight = ""]) => {
    const pct = /^(\d{1,3})\s*%?$/.exec(weight)?.[1];
    return { criterion, weightPct: pct ? Number(pct) : null };
  });
}
export function formatJudging(items: readonly JudgingItem[]): string {
  return items
    .map((j) => (j.weightPct === null ? j.criterion : `${j.criterion} | ${j.weightPct}%`))
    .join("\n");
}

/** "2026-12-05 | 10:00 AM | Check-in", or "10:00 AM | Check-in" without a date. */
export function parseSchedule(value: string): ScheduleItem[] {
  return lines(value).map((parts) => {
    const date = parts[0] && ISO_DATE.test(parts[0]) ? parts.shift()! : null;
    const [first = "", second = ""] = parts;
    return second ? { date, time: first, label: second } : { date, time: null, label: first };
  });
}
export function formatSchedule(items: readonly ScheduleItem[]): string {
  return items.map((s) => [s.date, s.time, s.label].filter(Boolean).join(" | ")).join("\n");
}

// Database rows -----------------------------------------------------------

/** The events columns for the details. */
export function detailsToRow(details: EventDetails) {
  return {
    format: details.format,
    length_hours: details.lengthHours,
    entry_fee_cents: details.entryFeeCents,
    open_to: details.openTo,
    level: details.level,
    apply_by: details.applyBy,
    apply_url: details.applyUrl,
    admission: details.admission,
    capacity: details.capacity,
    prize_total_cents: details.prizeTotalCents,
    prizes: details.prizes.length ? details.prizes : null,
    tracks: details.tracks.length ? details.tracks : null,
    tools: details.tools,
    judging: details.judging.length ? details.judging : null,
    schedule: details.schedule.length ? details.schedule : null,
    perks: details.perks,
    perk_notes: details.perkNotes,
    chat_url: details.chatUrl,
  };
}

export type DetailsRow = ReturnType<typeof detailsToRow>;

/** Reads the details back from an events row; a malformed list (hand-edited) reads as empty. */
export function detailsFromRow(row: {
  [K in keyof DetailsRow]: unknown;
}): EventDetails {
  const list = <T>(value: unknown, schema: z.ZodType<T>): T[] => {
    const parsed = z.array(schema).safeParse(value ?? []);
    return parsed.success ? parsed.data : [];
  };
  return {
    format: z.enum(FORMATS).nullable().catch(null).parse(row.format),
    lengthHours: (row.length_hours as number | null) ?? null,
    entryFeeCents: (row.entry_fee_cents as number | null) ?? null,
    openTo: (row.open_to as string | null) ?? null,
    level: z.enum(LEVELS).nullable().catch(null).parse(row.level),
    applyBy: (row.apply_by as string | null) ?? null,
    applyUrl: httpsUrl(row.apply_url as string | null),
    admission: z.enum(ADMISSIONS).nullable().catch(null).parse(row.admission),
    capacity: (row.capacity as number | null) ?? null,
    prizeTotalCents: (row.prize_total_cents as number | null) ?? null,
    prizes: list(row.prizes, prizeSchema),
    tracks: list(row.tracks, trackSchema),
    tools: (row.tools as string | null) ?? null,
    judging: list(row.judging, judgingSchema),
    schedule: list(row.schedule, scheduleSchema),
    perks: z
      .array(z.enum(PERKS))
      .catch([])
      .parse(row.perks ?? []),
    perkNotes: (row.perk_notes as string | null) ?? null,
    chatUrl: httpsUrl(row.chat_url as string | null),
  };
}

/** Whether any detail is set (the events list and page show nothing extra otherwise). */
export function hasDetails(details: EventDetails): boolean {
  return Object.entries(details).some(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== null));
}

// The admin form ----------------------------------------------------------

/** The admin form's text fields for the details, by input name. Perks are checkboxes. */
export const DETAIL_FIELDS = [
  "format",
  "lengthHours",
  "entryFee",
  "openTo",
  "level",
  "applyBy",
  "applyUrl",
  "admission",
  "capacity",
  "prizeTotal",
  "prizesText",
  "tracksText",
  "tools",
  "judgingText",
  "scheduleText",
  "perkNotes",
  "chatUrl",
] as const;
export type DetailField = (typeof DETAIL_FIELDS)[number];
export type DetailFormValues = Record<DetailField, string> & { perks: Perk[] };

/** What the form shows for saved (or drafted) details. */
export function detailsToForm(details: EventDetails): DetailFormValues {
  const money = (cents: number | null) =>
    cents === null ? "" : cents === 0 ? "Free" : formatDollars(cents);
  return {
    format: details.format ?? "",
    lengthHours: details.lengthHours?.toString() ?? "",
    entryFee: money(details.entryFeeCents),
    openTo: details.openTo ?? "",
    level: details.level ?? "",
    applyBy: details.applyBy ?? "",
    applyUrl: details.applyUrl ?? "",
    admission: details.admission ?? "",
    capacity: details.capacity?.toString() ?? "",
    prizeTotal: details.prizeTotalCents === null ? "" : formatDollars(details.prizeTotalCents),
    prizesText: formatPrizes(details.prizes),
    tracksText: formatTracks(details.tracks),
    tools: details.tools ?? "",
    judgingText: formatJudging(details.judging),
    scheduleText: formatSchedule(details.schedule),
    perkNotes: details.perkNotes ?? "",
    chatUrl: details.chatUrl ?? "",
    perks: details.perks,
  };
}

/**
 * The details from the admin form, checked by eventDetailsSchema. A link
 * that isn't https or an amount that isn't money is an error here (the
 * schema alone would drop it silently).
 */
export function detailsFromForm(
  values: Partial<Record<DetailField, string>> & { perks?: string[] },
): { ok: true; details: EventDetails } | { ok: false; error: string } {
  const get = (name: DetailField) => (values[name] ?? "").trim();
  const int = (name: DetailField) => (get(name) ? Number(get(name)) : null);
  const money = (name: DetailField, label: string) => {
    const value = get(name);
    if (!value) return { cents: null };
    if (/^free$/i.test(value)) return { cents: 0 };
    const cents = parseDollars(value);
    return cents === null ? { error: `${label} should be an amount like $5,000` } : { cents };
  };
  const fee = money("entryFee", "The entry fee");
  if ("error" in fee) return { ok: false, error: fee.error! };
  const total = money("prizeTotal", "The prize total");
  if ("error" in total) return { ok: false, error: total.error! };
  for (const [name, label] of [
    ["applyUrl", "The apply link"],
    ["chatUrl", "The chat link"],
  ] as const) {
    if (get(name) && !httpsUrl(get(name))) {
      return { ok: false, error: `${label} must be an https link` };
    }
  }
  const prizes = parsePrizes(get("prizesText"));
  const badPrize = prizes.find(
    (p, i) => p.amountCents === null && lines(get("prizesText"))[i]?.[1],
  );
  if (badPrize)
    return { ok: false, error: `Prize "${badPrize.label}": the amount should be like $5,000` };

  const parsed = eventDetailsSchema.safeParse({
    format: get("format") || null,
    lengthHours: int("lengthHours"),
    entryFeeCents: fee.cents,
    openTo: get("openTo"),
    level: get("level") || null,
    applyBy: get("applyBy") || null,
    applyUrl: get("applyUrl"),
    admission: get("admission") || null,
    capacity: int("capacity"),
    prizeTotalCents: total.cents,
    prizes,
    tracks: parseTracks(get("tracksText")),
    tools: get("tools"),
    judging: parseJudging(get("judgingText")),
    schedule: parseSchedule(get("scheduleText")),
    perks: values.perks ?? [],
    perkNotes: get("perkNotes"),
    chatUrl: get("chatUrl"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `Check the event details (${issue?.path.join(".") || "form"}: ${issue?.message})`,
    };
  }
  return { ok: true, details: parsed.data };
}

import "server-only";
import { z } from "zod";
import {
  ADMISSIONS,
  EMPTY_DETAILS,
  FORMATS,
  LEVELS,
  LIMITS,
  PERKS,
  detailsToForm,
  eventDetailsSchema,
  type DetailFormValues,
} from "@/lib/event-details";
import { llm, type LlmUsage } from "@/lib/llm/client";
import { EVENT_TOOL, eventDetailsSystemPrompt } from "@/lib/llm/prompts";
import { normalizeTags } from "@/lib/taxonomy/normalize";

/**
 * "Fill from event site" (P1-25): one model call turns an event page's text
 * into a draft of the event form. The draft is only ever shown in the form;
 * the admin checks it and saves (docs/plans/p1-25-event-details.md, section 3).
 */

const nullableText = z.string().nullable();
const nullableNumber = z.number().nullable();
const isoDate = z.string().nullable();

/** What the model returns: plain shapes, dollars as numbers; cleaned up below. */
export const eventDraftSchema = z.object({
  description: nullableText,
  start_date: isoDate,
  end_date: isoDate,
  time_label: nullableText,
  venue: nullableText,
  host: nullableText,
  domains: z.array(z.string()),
  format: z.enum(FORMATS).nullable(),
  length_hours: nullableNumber,
  entry_fee_usd: nullableNumber,
  open_to: nullableText,
  level: z.enum(LEVELS).nullable(),
  apply_by: isoDate,
  apply_url: nullableText,
  admission: z.enum(ADMISSIONS).nullable(),
  capacity: nullableNumber,
  prize_total_usd: nullableNumber,
  prizes: z.array(z.object({ label: z.string(), amount_usd: nullableNumber, note: nullableText })),
  tracks: z.array(
    z.object({ name: z.string(), description: nullableText, skills: z.array(z.string()) }),
  ),
  tools: nullableText,
  judging: z.array(z.object({ criterion: z.string(), weight_pct: nullableNumber })),
  schedule: z.array(z.object({ date: isoDate, time: nullableText, label: z.string() })),
  perks: z.array(z.string()),
  perk_notes: nullableText,
  chat_url: nullableText,
});
export type EventDraft = z.infer<typeof eventDraftSchema>;

/** The form fields a draft fills, by input name; empty ones are left out. */
export type DraftValues = Partial<Omit<DetailFormValues, "perks">> & {
  description?: string;
  timeLabel?: string;
  venue?: string;
  host?: string;
  startDate?: string;
  endDate?: string;
  perks?: string[];
  domains?: string[];
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const clip = (value: string | null | undefined, max: number) => {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
};
const date = (value: string | null) => (value && ISO.test(value) ? value : null);
const cents = (usd: number | null) =>
  usd === null || !Number.isFinite(usd) || usd < 0 ? null : Math.round(usd * 100);
const whole = (n: number | null, max: number) =>
  n === null || !Number.isFinite(n) || n < 1 ? null : Math.min(Math.round(n), max);

/** Turns the model's draft into form values, through the same checks a save makes. */
export function draftToValues(draft: EventDraft): DraftValues {
  const details = eventDetailsSchema.parse({
    ...EMPTY_DETAILS,
    format: draft.format,
    lengthHours: whole(draft.length_hours, 400),
    entryFeeCents: cents(draft.entry_fee_usd),
    openTo: clip(draft.open_to, 120),
    level: draft.level,
    applyBy: date(draft.apply_by),
    applyUrl: draft.apply_url,
    admission: draft.admission,
    capacity: whole(draft.capacity, 100_000),
    prizeTotalCents: cents(draft.prize_total_usd),
    prizes: draft.prizes
      .filter((p) => clip(p.label, 80))
      .slice(0, LIMITS.prizes)
      .map((p) => ({
        label: clip(p.label, 80)!,
        amountCents: cents(p.amount_usd),
        note: clip(p.note, 120),
      })),
    tracks: draft.tracks
      .filter((t) => clip(t.name, 60))
      .slice(0, LIMITS.tracks)
      .map((t) => ({
        name: clip(t.name, 60)!,
        description: clip(t.description, 240),
        skills: t.skills,
      })),
    tools: clip(draft.tools, 300),
    judging: draft.judging
      .filter((j) => clip(j.criterion, 80))
      .slice(0, LIMITS.judging)
      .map((j) => ({
        criterion: clip(j.criterion, 80)!,
        weightPct:
          j.weight_pct === null || j.weight_pct < 0 || j.weight_pct > 100
            ? null
            : Math.round(j.weight_pct),
      })),
    schedule: draft.schedule
      .filter((s) => clip(s.label, 100))
      .slice(0, LIMITS.schedule)
      .map((s) => ({ date: date(s.date), time: clip(s.time, 20), label: clip(s.label, 100)! })),
    perks: draft.perks.filter((p): p is (typeof PERKS)[number] =>
      (PERKS as readonly string[]).includes(p),
    ),
    perkNotes: clip(draft.perk_notes, 300),
    chatUrl: draft.chat_url,
  });

  const values: DraftValues = {};
  const form = detailsToForm(details);
  for (const [name, value] of Object.entries(form)) {
    if (Array.isArray(value) ? value.length : value) Object.assign(values, { [name]: value });
  }
  const basics: [keyof DraftValues, string | null][] = [
    ["description", clip(draft.description, 500)],
    ["timeLabel", clip(draft.time_label, 60)],
    ["venue", clip(draft.venue, 120)],
    ["host", clip(draft.host, 120)],
    ["startDate", date(draft.start_date)],
    ["endDate", date(draft.end_date)],
  ];
  for (const [name, value] of basics) if (value) Object.assign(values, { [name]: value });
  const domains = normalizeTags("domains", draft.domains).slice(0, 5);
  if (domains.length) values.domains = domains;
  return values;
}

/** Asks the model for a draft of the event form from a page's text. Throws `LlmError`. */
export async function draftEventFromText(
  pageText: string,
  today: string,
  onUsage?: (usage: LlmUsage) => void,
): Promise<DraftValues> {
  const draft = await llm.structured({
    system: eventDetailsSystemPrompt(today),
    user: `<page>\n${pageText}\n</page>`,
    schema: eventDraftSchema,
    toolName: EVENT_TOOL,
    maxTokens: 6000,
    timeoutMs: 45_000,
    onUsage,
  });
  return draftToValues(draft);
}

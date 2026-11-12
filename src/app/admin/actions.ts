"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { track } from "@/lib/analytics";
import { getConfig } from "@/lib/config";
import { LlmError, type LlmUsage } from "@/lib/llm/client";
import { EVENT_PROMPT_VERSION } from "@/lib/llm/prompts";
import { LIMITS } from "@/lib/rate-limit";
import { localDateString } from "@/lib/time";
import { draftEventFromText, type DraftValues } from "@/server/event-autofill";
import { EventPageError, MAX_TEXT_CHARS, fetchEventPageText } from "@/server/event-page";
import { allow } from "@/server/rate-limit";
import { DETAIL_FIELDS, detailsFromForm } from "@/lib/event-details";
import { EVENT_NAME_MAX } from "@/lib/event-name";
import { normalizeTags } from "@/lib/taxonomy/normalize";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { pausedUntilFor } from "@/lib/pause";
import { createAdminMatch, findUserIdByEmail, saveEvent, setOrganizer } from "@/server/admin";
import { parseNetIds } from "@/lib/pilot";
import { addPilotNetIds, removePilotNetId, setPilotOnly } from "@/server/pilot";
import { setPausedUntil } from "@/server/profiles";
import { setReportResolved } from "@/server/safety";

const form = (data: FormData) => Object.fromEntries(data);
const optional = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .default(null);

export async function toggleOrganizer(data: FormData) {
  await requireAdmin();
  const { userId, value } = z
    .object({ userId: z.guid(), value: z.enum(["true", "false"]) })
    .parse(form(data));
  await setOrganizer(userId, value === "true");
  revalidatePath("/admin/users");
}

export async function setUserPause(data: FormData) {
  await requireAdmin();
  const { userId, choice } = z
    .object({ userId: z.guid(), choice: z.enum(["indefinite", "resume"]) })
    .parse(form(data));
  await setPausedUntil(userId, pausedUntilFor(choice));
  revalidatePath("/admin/users");
  revalidatePath("/admin/reports");
}

/** Marks a report as dealt with, or opens it again. */
export async function resolveReportAction(data: FormData) {
  const admin = await requireAdmin();
  const { reportId, resolved } = z
    .object({ reportId: z.guid(), resolved: z.enum(["true", "false"]) })
    .parse(form(data));
  await setReportResolved(reportId, admin.id, resolved === "true");
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
}

const eventSchema = z
  .object({
    eventId: z
      .uuid()
      .nullable()
      .default(null)
      .or(z.literal("").transform(() => null)),
    name: z
      .string()
      .trim()
      .min(3, "Name the event")
      .max(EVENT_NAME_MAX, `Keep the name to ${EVENT_NAME_MAX} characters or fewer`),
    description: optional,
    url: optional.pipe(
      z
        .url({ protocol: /^https?$/, error: "The website must be an http(s) link" })
        .max(500)
        .nullable(),
    ),
    startDate: z.iso.date("Pick a start date"),
    endDate: z.iso.date("Pick an end date"),
    teamSizeMin: z.coerce.number().int().min(1).max(20),
    teamSizeMax: z.coerce.number().int().min(1).max(20),
    organizerEmail: optional.pipe(
      z
        .email("The organizer email doesn't look right")
        .max(254)
        .transform((e) => e.toLowerCase())
        .nullable(),
    ),
    timeLabel: optional.pipe(z.string().max(60, "Keep the time under 60 characters").nullable()),
    venue: optional.pipe(z.string().max(120, "Keep the venue under 120 characters").nullable()),
    host: optional.pipe(z.string().max(120, "Keep the host under 120 characters").nullable()),
    // Area tags (P1-24): the same areas people pick at sign-up.
    domains: z.array(z.string()).transform((tags) => normalizeTags("domains", tags)),
  })
  .refine((e) => e.endDate >= e.startDate, { message: "The end date is before the start date" })
  .refine((e) => e.teamSizeMax >= e.teamSizeMin, {
    message: "Max team size is below the minimum",
  });

/** Creates or updates an event. Errors come back in the URL, so the form needs no JavaScript. */
export async function saveEventAction(data: FormData) {
  await requireAdmin();
  const parsed = eventSchema.safeParse({ ...form(data), domains: data.getAll("domains") });
  const back =
    typeof data.get("eventId") === "string" && data.get("eventId")
      ? `/admin/events/${data.get("eventId")}`
      : "/admin/events";
  if (!parsed.success) {
    redirect(
      `${back}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form")}`,
    );
  }
  const details = detailsFromForm({
    ...Object.fromEntries(DETAIL_FIELDS.map((name) => [name, String(data.get(name) ?? "")])),
    perks: data.getAll("perks").map(String),
  });
  if (!details.ok) redirect(`${back}?error=${encodeURIComponent(details.error)}`);
  const { eventId, organizerEmail, ...input } = parsed.data;
  // The organizer may not use HackaMatch: keep their email, and link their
  // account if they have one (signing up later links it too).
  const organizerId = organizerEmail ? await findUserIdByEmail(organizerEmail) : null;
  const saved = await saveEvent(
    { ...input, organizerEmail, organizerId, details: details.details },
    eventId,
  );
  revalidatePath("/admin/events");
  revalidatePath("/");
  redirect(`/admin/events?saved=${saved.slug}`);
}

const matchSchema = z.object({
  emailX: z.string().trim().min(3),
  emailY: z.string().trim().min(3),
  ideaId: z
    .uuid()
    .or(z.literal(""))
    .transform((v) => v || null),
  eventId: z
    .uuid()
    .or(z.literal(""))
    .transform((v) => v || null),
  reasonForX: optional.pipe(z.string().max(200).nullable()),
  reasonForY: optional.pipe(z.string().max(200).nullable()),
});

/** Picks the email out of "Name <email>" (how the user picker shows people) or a bare email. */
function emailFrom(value: string): string {
  return (/<([^>]+)>/.exec(value)?.[1] ?? value).trim().toLowerCase();
}

export async function createMatchAction(data: FormData) {
  await requireAdmin();
  const parsed = matchSchema.safeParse(form(data));
  if (!parsed.success) redirect("/admin/matches?error=" + encodeURIComponent("Check the form"));
  const { emailX, emailY, ...rest } = parsed.data;
  const [userX, userY] = await Promise.all([
    findUserIdByEmail(emailFrom(emailX)),
    findUserIdByEmail(emailFrom(emailY)),
  ]);
  if (!userX || !userY) {
    redirect("/admin/matches?error=" + encodeURIComponent("Both people must have an account"));
  }
  const result = await createAdminMatch({ userX, userY, ...rest });
  revalidatePath("/admin/matches");
  if (!result.ok) redirect("/admin/matches?error=" + encodeURIComponent(result.error));
  redirect("/admin/matches?created=1");
}

export async function togglePilotOnly(data: FormData) {
  await requireAdmin();
  const { value } = z.object({ value: z.enum(["true", "false"]) }).parse(form(data));
  await setPilotOnly(value === "true");
  revalidatePath("/admin/pilot");
}

export async function addPilotAccess(data: FormData) {
  await requireAdmin();
  const { netids } = z.object({ netids: z.string().max(20_000) }).parse(form(data));
  const { netIds, invalid } = parseNetIds(netids);
  await addPilotNetIds(netIds);
  revalidatePath("/admin/pilot");
  const added = `${netIds.length} added`;
  const params: Record<string, string> = invalid.length
    ? { error: `${added}. Couldn't read: ${invalid.slice(0, 10).join(", ")}` }
    : { saved: added };
  redirect(`/admin/pilot?${new URLSearchParams(params)}`);
}

export async function removePilotAccess(data: FormData) {
  await requireAdmin();
  const { netid } = z.object({ netid: z.string().regex(/^[a-z0-9-]{2,40}$/) }).parse(form(data));
  await removePilotNetId(netid);
  revalidatePath("/admin/pilot");
}

const autofillSchema = z.object({
  url: z.string().trim().max(2048).default(""),
  text: z
    .string()
    .max(MAX_TEXT_CHARS * 2)
    .default(""),
});

export type AutofillResult = { ok: true; values: DraftValues } | { ok: false; error: string };

/**
 * "Fill from event site" (P1-25): drafts the event form from the event's page
 * (or text pasted from it). Returns the draft to the form; nothing is saved.
 * Each call is a paid model call, so it is rate limited and logged with its
 * token counts.
 */
export async function autofillEventAction(input: {
  url: string;
  text: string;
}): Promise<AutofillResult> {
  const admin = await requireAdmin();
  const parsed = autofillSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the link or the text" };
  const { url, text } = parsed.data;
  if (!url && !text.trim())
    return { ok: false, error: "Add the event's link, or paste its page text" };
  if (!(await allow(LIMITS.eventAutofill, admin.id))) {
    return { ok: false, error: "That's 30 fills this hour. Try again later." };
  }

  const source = text.trim() ? "text" : "url";
  let usage: LlmUsage | null = null;
  const log = (ok: boolean, chars: number, error?: string) =>
    after(() =>
      track(
        "event_autofilled",
        {
          ok,
          source,
          chars,
          error,
          prompt_version: EVENT_PROMPT_VERSION,
          model: usage?.model,
          input_tokens: usage?.inputTokens,
          output_tokens: usage?.outputTokens,
        },
        admin.id,
      ),
    );

  let pageText: string;
  // The page's own addresses (as given, and after redirects).
  const pageUrls = url ? [url] : [];
  try {
    if (source === "text") pageText = text.slice(0, MAX_TEXT_CHARS);
    else {
      const page = await fetchEventPageText(url);
      pageText = page.text;
      pageUrls.push(page.url);
    }
  } catch (error) {
    const message = error instanceof EventPageError ? error.message : "The site couldn't be read";
    log(false, 0, message);
    return { ok: false, error: `${message}. You can paste the page's text instead.` };
  }
  if (pageText.trim().length < 50) {
    log(false, pageText.length, "too little text");
    return {
      ok: false,
      error: "The page had almost no text (it may load with JavaScript). Paste its text instead.",
    };
  }

  try {
    const values = await draftEventFromText(
      pageText,
      localDateString(getConfig().APP_TIMEZONE),
      (u) => (usage = u),
      pageUrls,
    );
    log(true, pageText.length);
    return { ok: true, values };
  } catch (error) {
    console.error("autofillEventAction", error);
    log(false, pageText.length, error instanceof LlmError ? error.message : "draft failed");
    return {
      ok: false,
      error: "The AI couldn't read that page. Try again, or fill it in by hand.",
    };
  }
}

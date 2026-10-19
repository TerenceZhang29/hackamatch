"use server";

import { revalidatePath } from "next/cache";
import { EVENT_NAME_MAX } from "@/lib/event-name";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { pausedUntilFor } from "@/lib/pause";
import {
  createAdminMatch,
  findUserIdByEmail,
  saveEvent,
  setIdeaFeatured,
  setIdeaStatusAsAdmin,
  setOrganizer,
} from "@/server/admin";
import { setPausedUntil } from "@/server/profiles";

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
}

export async function toggleFeatured(data: FormData) {
  await requireAdmin();
  const { ideaId, value } = z
    .object({ ideaId: z.guid(), value: z.enum(["true", "false"]) })
    .parse(form(data));
  await setIdeaFeatured(ideaId, value === "true");
  revalidatePath("/admin/ideas");
  revalidatePath("/");
}

export async function changeIdeaStatusAsAdmin(data: FormData) {
  await requireAdmin();
  const { ideaId, status } = z
    .object({ ideaId: z.guid(), status: z.enum(["open", "filled", "archived"]) })
    .parse(form(data));
  await setIdeaStatusAsAdmin(ideaId, status);
  revalidatePath("/admin/ideas");
  revalidatePath("/");
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
  })
  .refine((e) => e.endDate >= e.startDate, { message: "The end date is before the start date" })
  .refine((e) => e.teamSizeMax >= e.teamSizeMin, {
    message: "Max team size is below the minimum",
  });

/** Creates or updates an event. Errors come back in the URL, so the form needs no JavaScript. */
export async function saveEventAction(data: FormData) {
  await requireAdmin();
  const parsed = eventSchema.safeParse(form(data));
  const back =
    typeof data.get("eventId") === "string" && data.get("eventId")
      ? `/admin/events/${data.get("eventId")}`
      : "/admin/events";
  if (!parsed.success) {
    redirect(
      `${back}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form")}`,
    );
  }
  const { eventId, organizerEmail, ...input } = parsed.data;
  // The organizer may not use HackaMatch: keep their email, and link their
  // account if they have one (signing up later links it too).
  const organizerId = organizerEmail ? await findUserIdByEmail(organizerEmail) : null;
  const saved = await saveEvent({ ...input, organizerEmail, organizerId }, eventId);
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

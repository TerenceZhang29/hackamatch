"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { sanitizeNext } from "@/lib/auth-helpers";
import {
  addEventInterests,
  getEventById,
  getEventPool,
  hasEnded,
  removeEventInterest,
  setInEventPool,
} from "@/server/events";

const schema = z.object({
  eventId: z.guid(),
  choice: z.enum(["going", "not-going", "keep-looking", "have-team", "looking-again"]),
  /** "I'm no longer going" with matches for the event needs a second, confirmed post. */
  confirmed: z.literal("1").optional(),
  returnTo: z.string().max(2048).optional(),
});

/**
 * Every choice about one event's pool, from the event page and the pair page:
 * going / not going, and once matched, keep looking / I have my team.
 */
export async function eventPoolAction(data: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(data));
  if (!parsed.success) redirect("/events");
  const { eventId, choice, confirmed, returnTo } = parsed.data;
  const event = await getEventById(eventId);
  if (!event) redirect("/events");
  const eventPath = `/e/${event.slug}`;
  const back = sanitizeNext(returnTo ?? null) ?? eventPath;
  const user = await requireOnboarded(back);

  if (choice === "going") {
    if (!hasEnded(event)) await addEventInterests(user.id, [event.id]);
  } else if (choice === "not-going") {
    const pool = await getEventPool(user.id, event.id);
    if (pool.matches.length > 0 && !confirmed) redirect(`${eventPath}?confirm=not-going`);
    await removeEventInterest(user.id, event.id);
  } else {
    const pool = await getEventPool(user.id, event.id);
    if (pool.going) await setInEventPool(user.id, event.id, choice !== "have-team");
  }
  revalidatePath(eventPath);
  redirect(back);
}

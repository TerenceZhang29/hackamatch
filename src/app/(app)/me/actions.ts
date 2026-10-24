"use server";

import { joinName } from "@/lib/display-name";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { track } from "@/lib/analytics";
import { requireOnboarded } from "@/lib/auth";
import { pausedUntilFor } from "@/lib/pause";
import { createClient } from "@/lib/supabase/server";
import {
  addEventInterests,
  filterUpcomingEventIds,
  listEventMatches,
  removeEventInterest,
} from "@/server/events";
import {
  deleteAccount,
  embedUserAndIdeas,
  saveEditedTags,
  setPausedUntil,
  updateName,
} from "@/server/profiles";
import { deleteSchema, eventInterestSchema, nameSchema, pauseSchema, tagsSchema } from "./schema";

/** What every /me action returns: nothing on success, or a message to show. */
export type ActionResult = { ok: true; notice?: string } | { ok: false; error: string };

function invalid(error: { issues: { message: string }[] }): ActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Check your input" };
}

function reembedLater(userId: string) {
  after(() => embedUserAndIdeas(userId));
}

/** Saves the name. It isn't part of the tags or the embedding, so nothing else reruns. */
export async function saveName(input: unknown): Promise<ActionResult> {
  const user = await requireOnboarded("/me");
  const parsed = nameSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  await updateName(user.id, joinName(parsed.data.firstName, parsed.data.lastName));
  revalidatePath("/me");
  return { ok: true };
}

export async function saveTags(input: unknown): Promise<ActionResult> {
  const user = await requireOnboarded("/me");
  const parsed = tagsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  if (await saveEditedTags(user.id, parsed.data.tags)) reembedLater(user.id);
  revalidatePath("/me");
  return { ok: true };
}

export async function setEventInterest(input: unknown): Promise<ActionResult> {
  const user = await requireOnboarded("/me");
  const parsed = eventInterestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const { eventId, interested } = parsed.data;
  if (interested) {
    const upcoming = await filterUpcomingEventIds([eventId]);
    if (upcoming.length === 0) return { ok: false, error: "That event has ended." };
    await addEventInterests(user.id, upcoming);
  } else {
    // With matches for the event, "not going" is confirmed on the event page.
    if ((await listEventMatches(user.id, eventId)).length > 0) {
      return {
        ok: false,
        error:
          "You've matched with people for this event. Use the event page to say you're not going.",
      };
    }
    await removeEventInterest(user.id, eventId);
  }
  revalidatePath("/me");
  return { ok: true };
}

export async function setPause(input: unknown): Promise<ActionResult> {
  const user = await requireOnboarded("/me");
  const parsed = pauseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const pausedUntil = pausedUntilFor(parsed.data.choice);
  await setPausedUntil(user.id, pausedUntil);
  if (pausedUntil) await track("paused", { choice: parsed.data.choice }, user.id);
  revalidatePath("/me");
  return { ok: true };
}

/** Deletes the account and everything that cascades from it, then signs out. */
export async function deleteMyAccount(input: unknown): Promise<ActionResult> {
  const user = await requireOnboarded("/me");
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  await supabase.auth.signOut();
  await deleteAccount(user.id);
  redirect("/?deleted=1");
}

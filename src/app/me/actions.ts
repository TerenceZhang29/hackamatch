"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { track } from "@/lib/analytics";
import { requireOnboarded } from "@/lib/auth";
import { LlmError } from "@/lib/llm/types";
import { pausedUntilFor } from "@/lib/pause";
import { LIMITS } from "@/lib/rate-limit";
import { allow } from "@/server/rate-limit";
import { createClient } from "@/lib/supabase/server";
import {
  addEventInterests,
  filterUpcomingEventIds,
  listEventMatches,
  removeEventInterest,
} from "@/server/events";
import { setIdeaStatus } from "@/server/ideas";
import {
  deleteAccount,
  embedUserAndIdeas,
  runProfileExtraction,
  saveEditedTags,
  setPausedUntil,
  updateName,
  updateRoleAndIntents,
  updateSentence,
} from "@/server/profiles";
import {
  deleteSchema,
  eventInterestSchema,
  ideaStatusSchema,
  nameSchema,
  pauseSchema,
  roleSchema,
  sentenceSchema,
  tagsSchema,
} from "./schema";

/** What every /me action returns: nothing on success, or a message to show. */
export type ActionResult = { ok: true; notice?: string } | { ok: false; error: string };

const EXTRACTION_TIMEOUT_MS = 8_000;

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

  await updateName(user.id, parsed.data.name);
  revalidatePath("/me");
  return { ok: true };
}

/** Saves the sentence, re-infers tags (kept if the user edited them) and re-embeds. */
export async function saveSentence(input: unknown): Promise<ActionResult> {
  const user = await requireOnboarded("/me");
  const parsed = sentenceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  if (!(await allow(LIMITS.llm, user.id))) {
    return { ok: false, error: "That's a lot of edits. Wait a few minutes and try again." };
  }
  await updateSentence(user.id, parsed.data.sentence);
  let notice: string | undefined;
  try {
    await runProfileExtraction(user.id, { timeoutMs: EXTRACTION_TIMEOUT_MS });
    reembedLater(user.id);
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    notice = "Saved. Your summary will update in a moment.";
    after(async () => {
      try {
        await runProfileExtraction(user.id, { timeoutMs: 30_000 });
      } catch (backgroundError) {
        console.error(`Background extraction failed for user ${user.id}`, backgroundError);
      }
      await embedUserAndIdeas(user.id);
    });
  }
  revalidatePath("/me");
  return { ok: true, notice };
}

export async function saveTags(input: unknown): Promise<ActionResult> {
  const user = await requireOnboarded("/me");
  const parsed = tagsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  if (await saveEditedTags(user.id, parsed.data.tags)) reembedLater(user.id);
  revalidatePath("/me");
  return { ok: true };
}

export async function saveRole(input: unknown): Promise<ActionResult> {
  const user = await requireOnboarded("/me");
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  await updateRoleAndIntents(user.id, parsed.data.role, parsed.data.intents);
  reembedLater(user.id);
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

export async function changeIdeaStatus(input: unknown): Promise<ActionResult> {
  const user = await requireOnboarded("/me");
  const parsed = ideaStatusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const changed = await setIdeaStatus(user.id, parsed.data.ideaId, parsed.data.status);
  if (!changed) return { ok: false, error: "That idea isn't yours." };
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

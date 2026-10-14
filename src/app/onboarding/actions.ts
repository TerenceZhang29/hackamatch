"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { track } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { sanitizeNext } from "@/lib/auth-helpers";
import { LlmError } from "@/lib/llm/types";
import { addEventInterests, filterUpcomingEventIds } from "@/server/events";
import {
  answerClarifyingQuestion,
  embedUserAndIdeas,
  isOnboarded,
  markJoinedPool,
  runProfileExtraction,
  saveEditedTags,
  saveOnboardingBasics,
  type ExtractionResult,
} from "@/server/profiles";
import {
  joinPoolInputSchema,
  sentenceInputSchema,
  type JoinPoolInput,
  type SentenceInput,
} from "./schema";

/** How long onboarding waits for tags before moving on and finishing in the background. */
const EXTRACTION_TIMEOUT_MS = 8_000;
/** Background extraction has no user waiting, so it gets more time. */
const BACKGROUND_TIMEOUT_MS = 30_000;

export type SentenceResult =
  | { status: "ok"; result: ExtractionResult }
  | { status: "pending" }
  | { status: "error"; message: string };

/**
 * Steps 1 and 2: saves role, intents, name and the one sentence, then infers
 * tags. If the LLM is slow or fails, the user moves on and tags are filled in
 * after the response.
 */
export async function submitSentence(input: SentenceInput): Promise<SentenceResult> {
  const user = await requireUser("/onboarding");
  const parsed = sentenceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your answers" };
  }

  await saveOnboardingBasics(user.id, parsed.data);
  await track("onboarding_step_completed", { step: 1 }, user.id);
  await track("onboarding_step_completed", { step: 2, role: parsed.data.role }, user.id);

  try {
    const result = await runProfileExtraction(user.id, { timeoutMs: EXTRACTION_TIMEOUT_MS });
    return { status: "ok", result };
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    console.warn("Onboarding extraction fell back to the background", error.message);
    after(() => extractInBackground(user.id));
    return { status: "pending" };
  }
}

async function extractInBackground(userId: string) {
  try {
    await runProfileExtraction(userId, { timeoutMs: BACKGROUND_TIMEOUT_MS });
    // If the user joined the pool while this ran, their profile was embedded
    // without these tags; embed again now that they exist.
    if (await isOnboarded(userId)) await embedUserAndIdeas(userId);
  } catch (error) {
    console.error(`Background extraction failed for user ${userId}`, error);
  }
}

/**
 * Step 3: saves any tag edits, the clarifying answer and event interests,
 * puts the user in the pool, and embeds their profile after the response.
 */
export async function joinPool(input: JoinPoolInput): Promise<{ error: string }> {
  const user = await requireUser("/onboarding");
  const parsed = joinPoolInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Something looks off. Reload the page and try again." };
  const { tags, eventIds, ideaId, clarifyingAnswer } = parsed.data;
  const next = sanitizeNext(parsed.data.next);

  if (!user.role || !user.raw_bio) return { error: "Go back and write your sentence first." };

  await saveEditedTags(user.id, tags);
  await addEventInterests(user.id, await filterUpcomingEventIds(eventIds));

  const joined = await markJoinedPool(user.id);
  if (joined) {
    await track("onboarding_step_completed", { step: 3 }, user.id);
    await track(
      "pool_joined",
      { seconds_since_link_click: joined.secondsSinceLinkClick, role: user.role },
      user.id,
    );
  }

  after(async () => {
    if (ideaId && clarifyingAnswer) {
      try {
        await answerClarifyingQuestion(user.id, ideaId, clarifyingAnswer);
      } catch (error) {
        console.error(`Clarifying answer failed for idea ${ideaId}`, error);
      }
    }
    await embedUserAndIdeas(user.id);
  });

  redirect(next ?? "/matches?welcome=1");
}

"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { track } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { fetchGithubSummary, parseGithubUsername } from "@/lib/imports/github";
import { cleanLinkedinText, normalizeLinkedinUrl } from "@/lib/imports/linkedin";
import { sanitizeNext } from "@/lib/auth-helpers";
import { LlmError } from "@/lib/llm/types";
import { LIMITS } from "@/lib/rate-limit";
import { allow } from "@/server/rate-limit";
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

  const data = parsed.data;
  if (!(await allow(LIMITS.llm, user.id))) {
    return { status: "error", message: "That's a lot of tries. Wait a few minutes and try again." };
  }

  // A GitHub profile is optional extra signal, and can replace the sentence.
  const githubUsername = data.githubUrl ? parseGithubUsername(data.githubUrl) : null;
  const github = data.githubUrl
    ? await fetchGithubSummary(data.githubUrl, { token: getConfig().GITHUB_TOKEN })
    : null;
  if (data.githubUrl && !github && data.sentence.length < 3) {
    return {
      status: "error",
      message: "We couldn't read that GitHub profile. Write a sentence instead.",
    };
  }

  await saveOnboardingBasics(user.id, {
    role: data.role,
    intents: data.intents,
    name: data.name ?? github?.name ?? null,
    sentence: data.sentence.length >= 3 ? data.sentence : (github?.bio ?? "(imported from GitHub)"),
    githubUrl: githubUsername ? `https://github.com/${githubUsername}` : null,
    githubSummary: github?.summaryText || null,
    linkedinUrl: data.linkedinUrl ? normalizeLinkedinUrl(data.linkedinUrl) : null,
    linkedinText: data.linkedinText ? cleanLinkedinText(data.linkedinText) : null,
  });
  await track("onboarding_step_completed", { step: 1 }, user.id);
  await track(
    "onboarding_step_completed",
    { step: 2, role: data.role, github: github !== null, linkedin: data.linkedinText !== null },
    user.id,
  );

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

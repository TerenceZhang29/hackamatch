"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { track } from "@/lib/analytics";
import { requireOnboarded } from "@/lib/auth";
import { extractIdea, type ExtractedIdea } from "@/lib/llm/extract-idea";
import { LlmError } from "@/lib/llm/types";
import { LIMITS } from "@/lib/rate-limit";
import { allow } from "@/server/rate-limit";
import { normalizeTag, normalizeTags } from "@/lib/taxonomy/normalize";
import { embedIdea } from "@/server/embed";
import { filterUpcomingEventIds } from "@/server/events";
import { createIdea, refreshIdeaExtraction } from "@/server/ideas";
import { answerClarifyingQuestion } from "@/server/profiles";
import { postIdeaSchema, previewSchema, type PostIdeaInput } from "../schema";

const EXTRACTION_TIMEOUT_MS = 8_000;

export type PreviewResult =
  | { status: "ok"; idea: ExtractedIdea }
  | { status: "pending" }
  | { status: "error"; message: string };

/** Turns the idea text into its public pitch and tags, without saving anything. */
export async function previewIdea(input: unknown): Promise<PreviewResult> {
  const user = await requireOnboarded("/ideas/new");
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your idea" };
  }
  if (!(await allow(LIMITS.llm, user.id))) {
    return {
      status: "error",
      message: "That's a lot of previews. Wait a few minutes and try again.",
    };
  }
  try {
    return {
      status: "ok",
      idea: await extractIdea({ text: parsed.data.text }, { timeoutMs: EXTRACTION_TIMEOUT_MS }),
    };
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    console.warn("Idea preview fell back to the background", error.message);
    return { status: "pending" };
  }
}

/** Saves the idea, finishes extraction and embedding after the response, and opens it. */
export async function postIdea(input: PostIdeaInput): Promise<{ error: string }> {
  const user = await requireOnboarded("/ideas/new");
  const parsed = postIdeaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your idea" };
  }
  if (!(await allow(LIMITS.ideas, user.id))) {
    return { error: "You've posted a lot of ideas today. Try again tomorrow." };
  }
  const { text, preview, answer } = parsed.data;
  const [eventId = null] = parsed.data.eventId
    ? await filterUpcomingEventIds([parsed.data.eventId])
    : [];

  const ideaId = await createIdea(user.id, {
    rawText: text,
    eventId,
    pitch: preview?.pitch ?? null,
    // The preview came from the client, so its tags go through the taxonomy again.
    domain: preview?.domain ? normalizeTag("domains", preview.domain) : null,
    skillsNeeded: preview ? normalizeTags("skills", preview.skills_needed) : [],
    scope: preview?.scope ?? null,
    clarifyingQuestion: preview?.clarifying_question ?? null,
  });
  await track("idea_posted", { has_event: eventId !== null, answered: answer !== null }, user.id);

  after(async () => {
    try {
      if (answer) await answerClarifyingQuestion(user.id, ideaId, answer);
      else if (!preview) await refreshIdeaExtraction(ideaId, { timeoutMs: 30_000 });
    } catch (error) {
      console.error(`Idea extraction failed for ${ideaId}`, error);
    }
    try {
      await embedIdea(ideaId);
    } catch (error) {
      console.error(`Embedding failed for idea ${ideaId}`, error);
    }
  });

  redirect(`/ideas/${ideaId}`);
}

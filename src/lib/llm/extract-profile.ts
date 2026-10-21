import "server-only";
import { z } from "zod";
import { tagLabel } from "@/lib/taxonomy/labels";
import { normalizeTags } from "@/lib/taxonomy/normalize";
import { llm } from "./client";
import { llmEnum, normalizeIdea, rawIdeaSchema, type ExtractedIdea } from "./extract-idea";
import {
  PROFILE_TOOL,
  profileSystemPrompt,
  profileUserPrompt,
  type ProfilePromptInput,
} from "./prompts";
import { isMetaText, isPlaceholderText, neutralSummary } from "./vague";

export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;

/** What the model returns for a profile, before tags are normalized. */
export const rawProfileSchema = z.object({
  summary: z.string().trim().min(1),
  skills: z.array(z.string()),
  stack: z.array(z.string()),
  domains: z.array(z.string()),
  experience_level: llmEnum(EXPERIENCE_LEVELS),
  idea: rawIdeaSchema.nullable(),
});

export interface ExtractedProfile {
  /** Null when the model only described the input and there are no tags to say anything with. */
  summary: string | null;
  /** Canonical taxonomy slugs, as are `stack` and `domains`. */
  skills: string[];
  stack: string[];
  domains: string[];
  experience_level: (typeof EXPERIENCE_LEVELS)[number];
  /**
   * Set when the text describes a product. For a builder it's kept only as a
   * private draft during sign-up (P1-22); runProfileExtraction decides.
   */
  idea: ExtractedIdea | null;
}

/**
 * Infers a profile (and, for idea people, their first idea) from the one
 * onboarding sentence plus any imported text. Throws `LlmError`.
 */
export async function extractProfile(
  input: ProfilePromptInput,
  options: { timeoutMs?: number } = {},
): Promise<ExtractedProfile> {
  const raw = await llm.structured({
    system: profileSystemPrompt(),
    user: profileUserPrompt(input),
    schema: rawProfileSchema,
    toolName: PROFILE_TOOL,
    timeoutMs: options.timeoutMs,
  });
  const tags = {
    skills: normalizeTags("skills", raw.skills),
    stack: normalizeTags("stack", raw.stack),
    domains: normalizeTags("domains", raw.domains),
  };
  // No idea from a placeholder sentence ("I want to build a xxx"), or from a
  // pitch that is only a note about the input (P1-21).
  const idea =
    raw.idea && !isPlaceholderText(input.sentence) && !isMetaText(raw.idea.pitch)
      ? normalizeIdea(raw.idea)
      : null;
  // A builder's idea stays a private draft until they post it (P1-22), and
  // the model's summary tends to mention it, so a builder with an idea gets
  // a summary built from their tags only.
  const hideIdea = input.role === "builder" && idea !== null;
  return {
    summary:
      hideIdea || isMetaText(raw.summary)
        ? neutralSummary(input.role, idea !== null && !hideIdea, tags, tagLabel)
        : raw.summary,
    ...tags,
    experience_level: raw.experience_level,
    idea,
  };
}

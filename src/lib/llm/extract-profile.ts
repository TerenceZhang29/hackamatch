import "server-only";
import { z } from "zod";
import { normalizeTags } from "@/lib/taxonomy/normalize";
import { llm } from "./client";
import { llmEnum, normalizeIdea, rawIdeaSchema, type ExtractedIdea } from "./extract-idea";
import {
  PROFILE_TOOL,
  profileSystemPrompt,
  profileUserPrompt,
  type ProfilePromptInput,
} from "./prompts";

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
  summary: string;
  /** Canonical taxonomy slugs, as are `stack` and `domains`. */
  skills: string[];
  stack: string[];
  domains: string[];
  experience_level: (typeof EXPERIENCE_LEVELS)[number];
  /** Set only when the role is `idea` or `both` and the text describes a product. */
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
  return {
    summary: raw.summary,
    skills: normalizeTags("skills", raw.skills),
    stack: normalizeTags("stack", raw.stack),
    domains: normalizeTags("domains", raw.domains),
    experience_level: raw.experience_level,
    // A builder never gets an idea, whatever the model returned.
    idea: raw.idea && input.role !== "builder" ? normalizeIdea(raw.idea) : null,
  };
}

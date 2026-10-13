import "server-only";
import { z } from "zod";
import { normalizeTag, normalizeTags } from "@/lib/taxonomy/normalize";
import { llm } from "./client";
import { IDEA_TOOL, ideaSystemPrompt, ideaUserPrompt } from "./prompts";

export const IDEA_SCOPES = ["weekend", "few_weeks", "ongoing"] as const;

/** What the model returns for an idea, before tags are normalized. */
export const rawIdeaSchema = z.object({
  pitch: z.string().trim().min(1),
  domain: z.string().nullable(),
  skills_needed: z.array(z.string()),
  scope: z.enum(IDEA_SCOPES),
  clarifying_question: z.string().trim().min(1).nullable(),
});

export type RawIdea = z.infer<typeof rawIdeaSchema>;

export interface ExtractedIdea {
  pitch: string;
  /** Canonical domain slug, or null when none fits. */
  domain: string | null;
  /** Canonical skills slugs. */
  skills_needed: string[];
  scope: (typeof IDEA_SCOPES)[number];
  clarifying_question: string | null;
}

/** Maps the model's tags onto the taxonomy; unknown ones are dropped. */
export function normalizeIdea(raw: RawIdea): ExtractedIdea {
  return {
    ...raw,
    domain: raw.domain ? normalizeTag("domains", raw.domain) : null,
    skills_needed: normalizeTags("skills", raw.skills_needed),
  };
}

/** Turns an idea's full text into its public pitch and tags. Throws `LlmError`. */
export async function extractIdea(
  input: { text: string },
  options: { timeoutMs?: number } = {},
): Promise<ExtractedIdea> {
  const raw = await llm.structured({
    system: ideaSystemPrompt(),
    user: ideaUserPrompt(input.text),
    schema: rawIdeaSchema,
    toolName: IDEA_TOOL,
    timeoutMs: options.timeoutMs,
  });
  return normalizeIdea(raw);
}

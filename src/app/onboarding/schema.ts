import { z } from "zod";

/** Input schemas for the onboarding server actions. Kept apart so they can be unit tested. */

export const ROLES = ["idea", "builder", "both"] as const;
export const INTENTS = ["hackathon", "side_project", "cofounder"] as const;

export const SENTENCE_MAX = 600;
export const ANSWER_MAX = 300;
const TAG_MAX = 30;

export const sentenceInputSchema = z.object({
  role: z.enum(ROLES),
  intents: z
    .array(z.enum(INTENTS))
    .min(1, "Pick at least one")
    .transform((intents) => [...new Set(intents)]),
  name: z
    .string()
    .trim()
    .max(80)
    .transform((name) => name || null)
    .nullable()
    .default(null),
  sentence: z
    .string()
    .trim()
    .min(3, "Write a sentence about yourself or your idea")
    .max(SENTENCE_MAX, `Keep it under ${SENTENCE_MAX} characters`),
});

export type SentenceInput = z.input<typeof sentenceInputSchema>;

const tagList = z.array(z.string().trim().min(1).max(60)).max(TAG_MAX);

export const joinPoolInputSchema = z.object({
  tags: z.object({ skills: tagList, stack: tagList, domains: tagList }),
  eventIds: z.array(z.uuid()).max(20).default([]),
  ideaId: z.uuid().nullable().default(null),
  clarifyingAnswer: z
    .string()
    .trim()
    .max(ANSWER_MAX)
    .transform((answer) => answer || null)
    .nullable()
    .default(null),
  next: z.string().max(2048).nullable().default(null),
});

export type JoinPoolInput = z.input<typeof joinPoolInputSchema>;

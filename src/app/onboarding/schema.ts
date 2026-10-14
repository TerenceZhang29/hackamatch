import { z } from "zod";
import { parseGithubUsername } from "@/lib/imports/github";
import { LINKEDIN_TEXT_MAX, normalizeLinkedinUrl } from "@/lib/imports/linkedin";

/** Input schemas for the onboarding server actions. Kept apart so they can be unit tested. */

export const ROLES = ["idea", "builder", "both"] as const;
export const INTENTS = ["hackathon", "side_project", "cofounder"] as const;

export const SENTENCE_MAX = 600;
export const ANSWER_MAX = 300;
const TAG_MAX = 30;

/** An optional free-text field: trimmed, and empty means absent. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .default(null);

export const sentenceInputSchema = z
  .object({
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
      .max(SENTENCE_MAX, `Keep it under ${SENTENCE_MAX} characters`)
      .default(""),
    githubUrl: optionalText(200),
    linkedinUrl: optionalText(200),
    linkedinText: optionalText(LINKEDIN_TEXT_MAX + 1000),
  })
  .superRefine((input, ctx) => {
    // A GitHub profile can stand in for the sentence.
    if (input.sentence.length < 3 && !input.githubUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["sentence"],
        message: "Write a sentence about yourself or your idea",
      });
    }
    if (input.githubUrl && !parseGithubUsername(input.githubUrl)) {
      ctx.addIssue({
        code: "custom",
        path: ["githubUrl"],
        message: "Paste a GitHub profile link, like github.com/yourname",
      });
    }
    if (input.linkedinUrl && !normalizeLinkedinUrl(input.linkedinUrl)) {
      ctx.addIssue({
        code: "custom",
        path: ["linkedinUrl"],
        message: "Paste a LinkedIn profile link, like linkedin.com/in/yourname",
      });
    }
  });

export type SentenceInput = z.input<typeof sentenceInputSchema>;

const tagList = z.array(z.string().trim().min(1).max(60)).max(TAG_MAX);

export const joinPoolInputSchema = z.object({
  tags: z.object({ skills: tagList, stack: tagList, domains: tagList }),
  eventIds: z.array(z.guid()).max(20).default([]),
  ideaId: z.guid().nullable().default(null),
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

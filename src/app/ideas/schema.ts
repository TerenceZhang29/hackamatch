import { z } from "zod";

/** Input schemas for posting and editing ideas. */

export const IDEA_TEXT_MAX = 1_000;
const ANSWER_MAX = 300;
const SCOPES = ["weekend", "few_weeks", "ongoing"] as const;

const ideaText = z
  .string()
  .trim()
  .min(10, "Describe your idea in a sentence or two")
  .max(IDEA_TEXT_MAX, `Keep it under ${IDEA_TEXT_MAX} characters`);

export const previewSchema = z.object({ text: ideaText });

export const postIdeaSchema = z.object({
  text: ideaText,
  eventId: z.uuid().nullable().default(null),
  /** What the preview showed; null when extraction had not finished. */
  preview: z
    .object({
      pitch: z.string().trim().min(1).max(200),
      domain: z.string().max(60).nullable(),
      skills_needed: z.array(z.string().max(60)).max(20),
      scope: z.enum(SCOPES),
      clarifying_question: z.string().max(200).nullable(),
    })
    .nullable()
    .default(null),
  answer: z
    .string()
    .trim()
    .max(ANSWER_MAX)
    .transform((answer) => answer || null)
    .nullable()
    .default(null),
});

export const ideaTagsSchema = z.object({
  ideaId: z.uuid(),
  skillsNeeded: z.array(z.string().trim().min(1).max(60)).max(20),
  domain: z.string().trim().max(60).nullable(),
  scope: z.enum(SCOPES).nullable(),
});

export type PostIdeaInput = z.input<typeof postIdeaSchema>;

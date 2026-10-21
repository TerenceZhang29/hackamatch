import { z } from "zod";
import { INTENTS, ROLES, SENTENCE_MAX, nameFields } from "@/app/(focus)/onboarding/schema";
import { PAUSE_CHOICES } from "@/lib/pause";

/** Input schemas for the /me server actions. */

const tagList = z.array(z.string().trim().min(1).max(60)).max(30);

export const sentenceSchema = z.object({
  sentence: z
    .string()
    .trim()
    .min(3, "Write at least a few words")
    .max(SENTENCE_MAX, `Keep it under ${SENTENCE_MAX} characters`),
});

export const nameSchema = z.object(nameFields);

export const tagsSchema = z.object({
  tags: z.object({ skills: tagList, stack: tagList, domains: tagList }),
});

export const roleSchema = z.object({
  role: z.enum(ROLES),
  intents: z
    .array(z.enum(INTENTS))
    .min(1, "Pick at least one")
    .transform((intents) => [...new Set(intents)]),
});

export const eventInterestSchema = z.object({
  eventId: z.guid(),
  interested: z.boolean(),
});

export const ideaStatusSchema = z.object({
  ideaId: z.guid(),
  status: z.enum(["open", "filled", "archived"]),
});

export const pauseSchema = z.object({ choice: z.enum(PAUSE_CHOICES) });

export const deleteSchema = z.object({
  confirm: z.literal("delete", { error: 'Type "delete" to confirm' }),
});

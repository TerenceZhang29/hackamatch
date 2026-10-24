import { z } from "zod";
import { nameFields } from "@/app/(focus)/onboarding/schema";
import { PAUSE_CHOICES } from "@/lib/pause";

/** Input schemas for the /me server actions. */

const tagList = z.array(z.string().trim().min(1).max(60)).max(30);

export const nameSchema = z.object(nameFields);

export const tagsSchema = z.object({
  tags: z.object({ skills: tagList, stack: tagList, domains: tagList }),
});

export const eventInterestSchema = z.object({
  eventId: z.guid(),
  interested: z.boolean(),
});

export const pauseSchema = z.object({ choice: z.enum(PAUSE_CHOICES) });

export const deleteSchema = z.object({
  confirm: z.literal("delete", { error: 'Type "delete" to confirm' }),
});

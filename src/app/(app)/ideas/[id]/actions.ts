"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { normalizeTag, normalizeTags } from "@/lib/taxonomy/normalize";
import { embedIdea } from "@/server/embed";
import { redirect } from "next/navigation";
import {
  discardDraft,
  getOwnIdea,
  publishDraft,
  setIdeaStatus,
  updateIdeaTags,
} from "@/server/ideas";
import { answerClarifyingQuestion } from "@/server/profiles";
import { ideaTagsSchema } from "../schema";

export type IdeaActionResult = { ok: true } | { ok: false; error: string };

const statusSchema = z.object({
  ideaId: z.guid(),
  status: z.enum(["open", "filled", "archived"]),
});
const answerSchema = z.object({ ideaId: z.guid(), answer: z.string().trim().min(1).max(300) });

function reembed(ideaId: string) {
  after(async () => {
    try {
      await embedIdea(ideaId);
    } catch (error) {
      console.error(`Embedding failed for idea ${ideaId}`, error);
    }
  });
}

export async function saveIdeaTags(input: unknown): Promise<IdeaActionResult> {
  const user = await requireOnboarded();
  const parsed = ideaTagsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the tags and try again." };
  const { ideaId, skillsNeeded, domain, scope } = parsed.data;

  const saved = await updateIdeaTags(user.id, ideaId, {
    skillsNeeded: normalizeTags("skills", skillsNeeded),
    domain: domain ? normalizeTag("domains", domain) : null,
    scope,
  });
  if (!saved) return { ok: false, error: "That idea isn't yours." };
  reembed(ideaId);
  revalidatePath(`/ideas/${ideaId}`);
  return { ok: true };
}

export async function saveIdeaStatus(input: unknown): Promise<IdeaActionResult> {
  const user = await requireOnboarded();
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your input." };
  const saved = await setIdeaStatus(user.id, parsed.data.ideaId, parsed.data.status);
  if (!saved) return { ok: false, error: "That idea isn't yours." };
  revalidatePath(`/ideas/${parsed.data.ideaId}`);
  return { ok: true };
}

/** Adds the answer to the idea's clarifying question, then re-extracts and re-embeds it. */
export async function answerIdeaQuestion(input: unknown): Promise<IdeaActionResult> {
  const user = await requireOnboarded();
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Write a short answer." };
  const { ideaId, answer } = parsed.data;
  if (!(await getOwnIdea(user.id, ideaId))) return { ok: false, error: "That idea isn't yours." };

  await answerClarifyingQuestion(user.id, ideaId, answer);
  reembed(ideaId);
  revalidatePath(`/ideas/${ideaId}`);
  return { ok: true };
}

const draftSchema = z.object({ ideaId: z.guid() });

/** Posts a builder's draft idea (P1-22): it goes public and is embedded. A plain form post. */
export async function postDraftIdea(formData: FormData): Promise<void> {
  const user = await requireOnboarded();
  const parsed = draftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/me");
  const { ideaId } = parsed.data;
  if (!(await publishDraft(user.id, ideaId))) redirect(`/ideas/${ideaId}`);
  reembed(ideaId);
  revalidatePath("/");
  revalidatePath("/me");
  redirect(`/ideas/${ideaId}?posted=1`);
}

/** Deletes a builder's draft idea. A plain form post. */
export async function discardDraftIdea(formData: FormData): Promise<void> {
  const user = await requireOnboarded();
  const parsed = draftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/me");
  await discardDraft(user.id, parsed.data.ideaId);
  revalidatePath("/me");
  redirect("/me");
}

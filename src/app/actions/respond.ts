"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { sanitizeNext } from "@/lib/auth-helpers";
import { LIMITS } from "@/lib/rate-limit";
import { allow } from "@/server/rate-limit";
import { parsePassToken, passToken } from "@/lib/deck";
import { removeCardPass } from "@/server/card-passes";
import { answerFromBoard, recordResponse, undoPass } from "@/server/matches";

const cardSchema = z.object({
  kind: z.enum(["person", "idea"]),
  targetId: z.guid(),
  response: z.enum(["interested", "pass"]),
  returnTo: z.string().max(2048).optional(),
});

/** Adds an outcome parameter to a same-site path, replacing any earlier outcome. */
function withOutcome(path: string, key: string, value: string): string {
  const url = new URL(path, "http://internal.invalid");
  for (const name of ["sent", "matched", "passed", "error"]) url.searchParams.delete(name);
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

/**
 * Interested / Pass on a board card, an idea page or a person page. A plain
 * form post, so it works without JavaScript; it redirects back to where the
 * user was with the outcome in the URL.
 */
export async function answerCard(formData: FormData): Promise<void> {
  const user = await requireOnboarded();
  const parsed = cardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/");
  const { kind, targetId, response } = parsed.data;
  const back = sanitizeNext(parsed.data.returnTo) ?? "/";
  if (!(await allow(LIMITS.answers, user.id))) redirect(withOutcome(back, "error", "busy"));

  const result = await answerFromBoard(
    user.id,
    kind === "idea" ? { kind, ideaId: targetId } : { kind, userId: targetId },
    response,
  );
  revalidatePath("/");
  revalidatePath("/matches");
  if (!result.ok) redirect(withOutcome(back, "error", result.error));
  // A Pass carries the card it hid, so the deck can offer "Undo" for it.
  if (result.response === "pass") redirect(withOutcome(back, "passed", passToken(kind, targetId)));
  if (result.revealed) redirect(withOutcome(back, "matched", result.matchId));
  redirect(withOutcome(back, "sent", "1"));
}

const undoSchema = z.object({
  /** `idea:<id>` / `person:<id>`, or a match id from before per-card passes. */
  passed: z.string().max(80),
  returnTo: z.string().max(2048).optional(),
});

/** "Undo" on the deck: takes back the viewer's last Pass. */
export async function undoPassAction(formData: FormData): Promise<void> {
  const user = await requireOnboarded();
  const parsed = undoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/");
  const back = sanitizeNext(parsed.data.returnTo) ?? "/";
  if (!(await allow(LIMITS.answers, user.id))) redirect(withOutcome(back, "error", "busy"));
  const pass = parsePassToken(parsed.data.passed);
  if (pass && "matchId" in pass) await undoPass(pass.matchId, user.id);
  else if (pass) await removeCardPass(user.id, pass.kind, pass.targetId);
  revalidatePath("/");
  redirect(back);
}

const matchSchema = z.object({
  matchId: z.guid(),
  response: z.enum(["interested", "pass"]),
});

/** Interested / Pass on a match listed on /matches. */
export async function answerMatch(formData: FormData): Promise<void> {
  const user = await requireOnboarded("/matches");
  const parsed = matchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/matches");
  const result = await recordResponse(parsed.data.matchId, user.id, parsed.data.response);
  revalidatePath("/matches");
  revalidatePath("/");
  if (!result) redirect("/matches?error=unavailable");
  if (result.revealedNow) redirect(`/matches?matched=${parsed.data.matchId}`);
  redirect("/matches");
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { tokenSecret } from "@/server/notify";
import { verifyToken } from "@/lib/notify/tokens";
import { PAUSE_CHOICES, pausedUntilFor } from "@/lib/pause";
import { recordResponse } from "@/server/matches";
import { setPausedUntil } from "@/server/profiles";

const responseSchema = z.object({
  token: z.string().min(1).max(1024),
  response: z.enum(["interested", "pass"]),
});

/**
 * Records an answer from a one-click email link. The token authorizes exactly
 * one (match, user) pair; the button chooses the answer, so a user can change
 * their mind from the same link.
 */
export async function respondFromToken(formData: FormData): Promise<void> {
  const parsed = responseSchema.safeParse({
    token: formData.get("token"),
    response: formData.get("response"),
  });
  if (!parsed.success) redirect("/login");
  const { token, response } = parsed.data;

  const verified = verifyToken(token, tokenSecret());
  if (!verified.ok || !verified.payload.matchId) redirect(`/r/${encodeURIComponent(token)}`);
  const { matchId, userId } = verified.payload;

  await recordResponse(matchId, userId, response);
  redirect(`/r/${encodeURIComponent(token)}?done=1`);
}

const pauseSchema = z.object({
  token: z.string().min(1).max(1024),
  choice: z.enum(PAUSE_CHOICES),
});

/** Pauses (or resumes) matches from an email footer link, without signing in. */
export async function pauseFromToken(formData: FormData): Promise<void> {
  const parsed = pauseSchema.safeParse({
    token: formData.get("token"),
    choice: formData.get("choice"),
  });
  if (!parsed.success) redirect("/login");
  const { token, choice } = parsed.data;

  const verified = verifyToken(token, tokenSecret());
  if (!verified.ok || verified.payload.action !== "pause")
    redirect(`/r/${encodeURIComponent(token)}`);
  const pausedUntil = pausedUntilFor(choice);
  await setPausedUntil(verified.payload.userId, pausedUntil);
  if (pausedUntil) await track("paused", { choice, source: "email" }, verified.payload.userId);
  redirect(`/r/${encodeURIComponent(token)}?done=1`);
}

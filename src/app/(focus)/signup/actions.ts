"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { getUser, requireUser } from "@/lib/auth";
import { normalizeEmail } from "@/lib/auth-helpers";
import { answersSchema, type SignupAnswers } from "@/lib/signup";
import { DOMAIN_ERROR, sendMagicLink } from "@/server/magic-link";
import { embedUserAndIdeas } from "@/server/profiles";
import {
  completeSignup,
  deletePendingSignup,
  getPendingSignup,
  savePendingSignup,
} from "@/server/signup";

type Result = { ok: true; email?: string } | { ok: false; error: string };

const emailSchema = z.string().transform(normalizeEmail).pipe(z.email().max(254));

function invalid(error: z.ZodError): Result {
  return { ok: false, error: error.issues[0]?.message ?? "Check your answers" };
}

/** Joins the pool with these answers, then embeds the profile after the response. */
async function join(userId: string, answers: SignupAnswers) {
  await completeSignup(userId, answers);
  after(() => embedUserAndIdeas(userId));
}

/**
 * The last step of `/signup` (P1-24): keeps the answers under the email and
 * sends a sign-in link that comes back to `/signup/finish`. The answers are
 * saved only once the link is on its way, so a refused email leaves nothing.
 */
export async function startSignup(input: unknown, rawEmail: unknown): Promise<Result> {
  const answers = answersSchema.safeParse(input);
  if (!answers.success) return invalid(answers.error);
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) return { ok: false, error: DOMAIN_ERROR };

  // Someone already signed in skips the email.
  const user = await getUser();
  if (user && !user.onboarded_at) {
    await join(user.id, answers.data);
    redirect("/");
  }

  const sent = await sendMagicLink(email.data, "/signup/finish");
  if (!sent.ok) return { ok: false, error: sent.message };
  await savePendingSignup(email.data, answers.data);
  return { ok: true, email: email.data };
}

/** `/onboarding`: the same steps for someone already signed in, so no email. */
export async function submitOnboarding(input: unknown): Promise<Result> {
  const user = await requireUser("/onboarding");
  if (user.onboarded_at) redirect("/");
  const answers = answersSchema.safeParse(input);
  if (!answers.success) return invalid(answers.error);
  await join(user.id, answers.data);
  redirect("/");
}

/** "Join" on `/signup/finish`: applies the waiting answers, never silently. */
export async function finishSignup(): Promise<void> {
  const user = await requireUser("/signup/finish");
  if (user.onboarded_at) redirect("/");
  const answers = await getPendingSignup(user.cornell_email);
  if (!answers) redirect("/onboarding");
  await join(user.id, answers);
  await deletePendingSignup(user.cornell_email);
  redirect("/");
}

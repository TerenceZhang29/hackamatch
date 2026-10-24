import "server-only";
import { track } from "@/lib/analytics";
import { joinName } from "@/lib/display-name";
import { answersSchema, PENDING_HOURS, splitSkills, type SignupAnswers } from "@/lib/signup";
import { createServiceClient } from "@/lib/supabase/service";
import { addEventInterests, filterUpcomingEventIds } from "./events";
import { markJoinedPool } from "./profiles";

/**
 * Sign-up with the email last (P1-24, docs/plans/p1-24-redesign.md): the
 * answers wait in `pending_signups`, keyed by email, until the magic link is
 * confirmed, so they survive a link opened on another device. They are only
 * applied after the person sees them again and presses Join.
 */

/** Keeps the answers for this email, replacing any earlier ones, for PENDING_HOURS. */
export async function savePendingSignup(email: string, answers: SignupAnswers) {
  const expires = new Date(Date.now() + PENDING_HOURS * 60 * 60 * 1000);
  const { error } = await createServiceClient()
    .from("pending_signups")
    .upsert(
      { email, answers, created_at: new Date().toISOString(), expires_at: expires.toISOString() },
      { onConflict: "email" },
    );
  if (error) throw new Error(`savePendingSignup: ${error.message}`);
}

/** The answers waiting for this email, if any and not expired. */
export async function getPendingSignup(email: string): Promise<SignupAnswers | null> {
  const { data, error } = await createServiceClient()
    .from("pending_signups")
    .select("answers")
    .eq("email", email.toLowerCase())
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`getPendingSignup: ${error.message}`);
  const parsed = answersSchema.safeParse(data?.answers);
  return parsed.success ? parsed.data : null;
}

export async function deletePendingSignup(email: string) {
  const { error } = await createServiceClient()
    .from("pending_signups")
    .delete()
    .eq("email", email.toLowerCase());
  if (error) throw new Error(`deletePendingSignup: ${error.message}`);
}

/**
 * Applies sign-up answers to a signed-in account that hasn't joined yet:
 * name, areas and skills, hackathons, then joins the pool. No AI: the picks
 * are the profile (owner, 2026-10-22). Returns false if they had already
 * joined, in which case nothing changes.
 */
export async function completeSignup(userId: string, answers: SignupAnswers): Promise<boolean> {
  const supabase = createServiceClient();
  const { data: user, error } = await supabase
    .from("users")
    .select("onboarded_at")
    .eq("id", userId)
    .single();
  if (error) throw new Error(`completeSignup: ${error.message}`);
  if (user.onboarded_at) return false;

  const { error: userError } = await supabase
    .from("users")
    .update({
      name: joinName(answers.firstName, answers.lastName),
      // There are no roles any more (P1-24), but the board functions still
      // require one until the second migration drops that check; "both"
      // matches every filter.
      role: "both",
    })
    .eq("id", userId);
  if (userError) throw new Error(`completeSignup: ${userError.message}`);

  const { skills, stack } = splitSkills(answers.skills);
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      skills,
      stack,
      domains: answers.domains,
      user_edited: true,
      extracted_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (profileError) throw new Error(`completeSignup: ${profileError.message}`);

  await addEventInterests(userId, await filterUpcomingEventIds(answers.eventIds));
  const joined = await markJoinedPool(userId);
  if (joined) {
    await track(
      "pool_joined",
      { seconds_since_link_click: joined.secondsSinceLinkClick, route: "signup" },
      userId,
    );
  }
  return joined !== null;
}

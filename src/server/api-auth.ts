import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getConfig } from "@/lib/config";
import type { Session } from "@supabase/supabase-js";
import { track } from "@/lib/analytics";
import { anonClient } from "@/lib/api/auth";
import type { ApiSession } from "@/lib/api/schemas";
import { LIMITS } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { allow } from "./rate-limit";

/**
 * Sign-in for the iOS app (docs/plans/ios-app.md): the emailed 6-digit code
 * instead of the link. Asking for the email goes through `sendMagicLink`, the
 * same as the web, so the domain check, rate limits and pilot gate apply.
 */

function toApiSession(session: Session): ApiSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
  };
}

export type VerifyResult =
  { ok: true; session: ApiSession } | { ok: false; error: "invalid_code" | "rate_limited" };

/**
 * Trades the code from the sign-in email for a session. Guesses are counted
 * per address: a 6-digit code that lasts an hour must not be brute-forced.
 */
export async function verifyEmailCode(email: string, code: string): Promise<VerifyResult> {
  if (!(await allow(LIMITS.verifyCode, email))) return { ok: false, error: "rate_limited" };
  if (isReviewAccount(email)) return reviewSignIn(email, code);

  const { data, error } = await anonClient().auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.session || !data.user) {
    if (error) console.error("Code verification failed", error.code, error.message);
    return { ok: false, error: "invalid_code" };
  }
  return { ok: true, session: await signedIn(data.user.id, data.session, "code") };
}

/** What every app sign-in records, then the session to hand back. */
async function signedIn(userId: string, session: Session, via: "code" | "link" | "review") {
  await track("magic_link_clicked", { via: `app-${via}` }, userId);
  // Start the onboarding clock on the first sign-in only, as the web's confirm step does.
  const { error } = await createServiceClient()
    .from("users")
    .update({ onboarding_started_at: new Date().toISOString() })
    .eq("id", userId)
    .is("onboarding_started_at", null);
  if (error) console.error("app sign-in: onboarding clock", error.message);
  return toApiSession(session);
}

/** Whether this address is App Store review's (only while REVIEW_CODE is set). */
export function isReviewAccount(email: string): boolean {
  const { REVIEW_EMAIL, REVIEW_CODE } = getConfig();
  return Boolean(REVIEW_CODE) && email === REVIEW_EMAIL.trim().toLowerCase();
}

/**
 * App Store review signs in with the fixed REVIEW_CODE: Apple's reviewers
 * can't read a Cornell inbox. The account is made on its first sign-in (the
 * pilot list must include it while the gate is on), then signed in through a
 * link that is generated and used here, never emailed.
 */
async function reviewSignIn(email: string, code: string): Promise<VerifyResult> {
  const expected = Buffer.from(getConfig().REVIEW_CODE ?? "");
  const given = Buffer.from(code);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, error: "invalid_code" };
  }
  const admin = createServiceClient();
  const { data: user } = await admin
    .from("users")
    .select("id")
    .eq("cornell_email", email)
    .maybeSingle();
  if (!user) {
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) {
      console.error("review sign-in: creating the account failed", error.message);
      return { ok: false, error: "invalid_code" };
    }
  }
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link.properties?.hashed_token) {
    console.error("review sign-in: link failed", linkError?.message);
    return { ok: false, error: "invalid_code" };
  }
  const { data, error } = await anonClient().auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email",
  });
  if (error || !data.session || !data.user) {
    console.error("review sign-in: verify failed", error?.message);
    return { ok: false, error: "invalid_code" };
  }
  return { ok: true, session: await signedIn(data.user.id, data.session, "review") };
}

/**
 * The same sign-in from the emailed link, when it opened the app (a
 * universal link). The token is long and single-use, so it needs no guess limit.
 */
export async function verifyEmailLink(tokenHash: string): Promise<VerifyResult> {
  const { data, error } = await anonClient().auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (error || !data.session || !data.user) {
    if (error) console.error("Link verification failed", error.code, error.message);
    return { ok: false, error: "invalid_code" };
  }
  return { ok: true, session: await signedIn(data.user.id, data.session, "link") };
}

/** A fresh session from a refresh token, or null when it is unknown, used or revoked. */
export async function refreshApiSession(refreshToken: string): Promise<ApiSession | null> {
  const { data, error } = await anonClient().auth.refreshSession({ refresh_token: refreshToken });
  return error || !data.session ? null : toApiSession(data.session);
}

/** Ends the session behind this access token; its refresh token stops working. */
export async function signOutApiSession(accessToken: string): Promise<void> {
  const { error } = await createServiceClient().auth.admin.signOut(accessToken, "local");
  if (error) console.error("signOutApiSession", error.message);
}

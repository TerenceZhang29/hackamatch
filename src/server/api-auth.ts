import "server-only";
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

  const { data, error } = await anonClient().auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.session || !data.user) {
    if (error) console.error("Code verification failed", error.code, error.message);
    return { ok: false, error: "invalid_code" };
  }
  const userId = data.user.id;
  await track("magic_link_clicked", { via: "code" }, userId);

  // Start the onboarding clock on the first sign-in only, as the web's confirm step does.
  const { error: clockError } = await createServiceClient()
    .from("users")
    .update({ onboarding_started_at: new Date().toISOString() })
    .eq("id", userId)
    .is("onboarding_started_at", null);
  if (clockError) console.error("verifyEmailCode: onboarding clock", clockError.message);

  return { ok: true, session: toApiSession(data.session) };
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

import "server-only";
import { headers } from "next/headers";
import { track } from "@/lib/analytics";
import { isAllowedEmailDomain } from "@/lib/auth-helpers";
import { getConfig } from "@/lib/config";
import { PILOT_DENIED } from "@/lib/pilot";
import { clientIp, LIMITS } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { pilotCanSignIn } from "./pilot";
import { allow } from "./rate-limit";

export const DOMAIN_ERROR = "Use your @cornell.edu email";

/**
 * Sends a sign-in link to an already normalized email, after the same checks
 * everywhere (sign-in and sign-up, P1-24): an allowed domain, the email and IP
 * rate limits, and the pilot list.
 */
export async function sendMagicLink(
  email: string,
  next: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const config = getConfig();
  const supabase = await createClient();

  // The database is authoritative for allowed domains; the env var is only a
  // fallback if the settings row can't be read.
  const { data: settings } = await supabase
    .from("app_settings")
    .select("allowed_email_domains")
    .maybeSingle();
  const allowedDomains = settings?.allowed_email_domains ?? config.ALLOWED_EMAIL_DOMAINS;

  // Reject before any email is sent.
  if (!isAllowedEmailDomain(email, allowedDomains)) return { ok: false, message: DOMAIN_ERROR };

  // Checked after the domain, so bad addresses don't use up anyone's allowance.
  const ip = clientIp(await headers());
  const [emailOk, ipOk] = await Promise.all([
    allow(LIMITS.loginEmail, email),
    allow(LIMITS.loginIp, ip, config.LOGIN_RATE_LIMIT_PER_IP),
  ]);
  if (!emailOk || !ipOk) {
    return { ok: false, message: "Too many sign-in emails. Wait a while and try again." };
  }

  // During the pilot, only listed netIDs may create an account. Checked after
  // the rate limit, so the list can't be probed quickly.
  if (!(await pilotCanSignIn(email))) return { ok: false, message: PILOT_DENIED };

  // `next` is always present, even when empty: the email templates append
  // `&token_hash=…` to this URL (see supabase/templates).
  const confirm = new URL("/auth/confirm", config.APP_URL);
  confirm.searchParams.set("next", next ?? "");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: confirm.toString() },
  });
  if (error) {
    console.error("signInWithOtp failed", error.status, error.code, error.message);
    return {
      ok: false,
      message:
        error.status === 429
          ? "Too many sign-in emails just now. Wait a minute and try again."
          : "We couldn't send your sign-in link. Try again.",
    };
  }

  await track("magic_link_requested", { has_next: next !== null });
  return { ok: true };
}

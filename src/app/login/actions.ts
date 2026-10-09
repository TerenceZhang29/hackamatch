"use server";

import { z } from "zod";
import { track } from "@/lib/analytics";
import { isAllowedEmailDomain, normalizeEmail, sanitizeNext } from "@/lib/auth-helpers";
import { getConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string; email: string };

const DOMAIN_ERROR = "Use your @cornell.edu email";

const inputSchema = z.object({
  email: z.string().transform(normalizeEmail).pipe(z.email().max(254)),
  next: z.string().max(2048).optional(),
});

export async function requestMagicLink(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const rawEmail = formData.get("email");
  const rawNext = formData.get("next");
  const typedEmail = typeof rawEmail === "string" ? rawEmail.trim() : "";

  const parsed = inputSchema.safeParse({
    email: typedEmail,
    next: typeof rawNext === "string" ? rawNext : undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: DOMAIN_ERROR, email: typedEmail };
  }
  const { email } = parsed.data;
  const next = sanitizeNext(parsed.data.next);

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
  if (!isAllowedEmailDomain(email, allowedDomains)) {
    return { status: "error", message: DOMAIN_ERROR, email: typedEmail };
  }

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
    const message =
      error.status === 429
        ? "Too many sign-in emails just now. Wait a minute and try again."
        : "We couldn't send your sign-in link. Try again.";
    return { status: "error", message, email: typedEmail };
  }

  await track("magic_link_requested", { has_next: next !== null });
  return { status: "sent", email };
}

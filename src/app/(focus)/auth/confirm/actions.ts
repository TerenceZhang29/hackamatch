"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { sanitizeNext } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  tokenHash: z.string().min(1).max(512),
  next: z.string().max(2048).optional(),
});

/**
 * Verifies a magic-link token and signs the user in, then sends new users to
 * onboarding and returning users to `next`. Runs only when the user presses
 * the button on /auth/confirm, so a mail scanner fetching the link can't use
 * up the single-use token.
 */
export async function confirmSignIn(formData: FormData): Promise<void> {
  const rawToken = formData.get("token_hash");
  const rawNext = formData.get("next");
  const next = sanitizeNext(typeof rawNext === "string" ? rawNext : null);

  const loginParams = new URLSearchParams({ error: "link" });
  if (next) loginParams.set("next", next);
  const failedPath = `/login?${loginParams}`;

  const parsed = inputSchema.safeParse({
    tokenHash: typeof rawToken === "string" ? rawToken : "",
    next: typeof rawNext === "string" ? rawNext : undefined,
  });
  if (!parsed.success) redirect(failedPath);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: parsed.data.tokenHash,
    type: "email",
  });
  if (error || !data.user) {
    console.error("Magic-link verification failed", error?.code, error?.message);
    redirect(failedPath);
  }
  const userId = data.user.id;

  await track("magic_link_clicked", {}, userId);

  // Start the onboarding clock on the first sign-in only.
  await supabase
    .from("users")
    .update({ onboarding_started_at: new Date().toISOString() })
    .eq("id", userId)
    .is("onboarding_started_at", null);

  const { data: user } = await supabase
    .from("users")
    .select("onboarded_at")
    .eq("id", userId)
    .maybeSingle();

  if (!user?.onboarded_at) {
    // Carry `next` so onboarding can return the user to the card they came from.
    redirect(next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding");
  }
  redirect(next ?? "/matches");
}

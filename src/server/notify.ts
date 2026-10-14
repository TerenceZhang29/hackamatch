import "server-only";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { getConfig } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";
import { localDateString } from "@/lib/time";
import { fakeEmailProvider } from "@/lib/notify/fake";
import { createResendProvider } from "@/lib/notify/resend";
import { signToken, type TokenAction } from "@/lib/notify/tokens";
import type { EmailProvider } from "@/lib/notify/types";

/**
 * Sending notifications. Every message goes through `send`, which picks the
 * channel, renders the template, adds the unsubscribe headers, sends it and
 * records it in `notification_log`.
 */

export type NotificationKind =
  "digest" | "curated_digest" | "weekly" | "inbound_interest" | "mutual" | "event_nudge";

/** A development-only secret, so local links work without configuring one. Never used in production. */
const DEV_TOKEN_SECRET = "hackamatch-local-development-token-secret";

export function tokenSecret(): string {
  const config = getConfig();
  if (config.RESPONSE_TOKEN_SECRET) return config.RESPONSE_TOKEN_SECRET;
  if (config.NODE_ENV === "production") throw new Error("RESPONSE_TOKEN_SECRET is not set");
  return DEV_TOKEN_SECRET;
}

function appUrl(path: string): string {
  return new URL(path, getConfig().APP_URL).toString();
}

/** One-click link for answering a match from an email. */
export function responseUrl(
  matchId: string,
  userId: string,
  action: Exclude<TokenAction, "pause">,
) {
  return appUrl(`/r/${signToken({ matchId, userId, action }, tokenSecret())}`);
}

/** Pause / manage link for email footers; works without signing in. */
export function pauseUrl(userId: string) {
  return appUrl(`/r/${pauseToken(userId)}`);
}

function pauseToken(userId: string) {
  // Footer links stay valid longer than match links.
  const exp = Math.floor(Date.now() / 1000) + 180 * 24 * 60 * 60;
  return signToken({ matchId: null, userId, action: "pause", exp }, tokenSecret());
}

let cachedProvider: EmailProvider | undefined;

function provider(): EmailProvider {
  if (!cachedProvider) {
    const config = getConfig();
    if (config.EMAIL_PROVIDER === "resend") {
      if (!config.RESEND_API_KEY || !config.EMAIL_FROM) throw new Error("Resend is not configured");
      cachedProvider = createResendProvider({
        apiKey: config.RESEND_API_KEY,
        from: config.EMAIL_FROM,
      });
    } else {
      cachedProvider = fakeEmailProvider;
    }
  }
  return cachedProvider;
}

export type SendResult = "sent" | "skipped" | "failed";

/**
 * Sends one notification to a user. Email is the only channel in Phase 1;
 * users whose channel is `none` are skipped. A `digest`-type kind is sent at
 * most once per user per local day (enforced by a unique index); the second
 * attempt is skipped. Failures are logged, never thrown.
 */
export async function send(options: {
  userId: string;
  kind: NotificationKind;
  subject: string;
  email: ReactElement;
  payload?: Record<string, unknown>;
}): Promise<SendResult> {
  const supabase = createServiceClient();
  const config = getConfig();
  const { data: user, error } = await supabase
    .from("users")
    .select("cornell_email, notify_channel")
    .eq("id", options.userId)
    .single();
  if (error) {
    console.error(`notify: no user ${options.userId}`, error.message);
    return "failed";
  }

  const localDate = localDateString(config.APP_TIMEZONE);
  const skip = user.notify_channel === "none";
  const { data: log, error: logError } = await supabase
    .from("notification_log")
    .insert({
      user_id: options.userId,
      channel: user.notify_channel === "none" ? "none" : "email",
      kind: options.kind,
      local_date: localDate,
      payload: { subject: options.subject, ...options.payload },
      status: skip ? "skipped" : "sent",
    })
    .select("id")
    .single();
  if (logError) {
    // 23505: unique violation, i.e. this digest was already sent today.
    if (logError.code === "23505") return "skipped";
    console.error("notify: could not log notification", logError.message);
    return "failed";
  }
  if (skip) return "skipped";

  try {
    const unsubscribe = appUrl(`/r/${pauseToken(options.userId)}/unsubscribe`);
    const [html, text] = await Promise.all([
      render(options.email),
      render(options.email, { plainText: true }),
    ]);
    const { id } = await provider().send({
      to: user.cornell_email,
      subject: options.subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${unsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    await supabase.from("notification_log").update({ provider_id: id }).eq("id", log.id);
    return "sent";
  } catch (sendError) {
    console.error(`notify: sending ${options.kind} to ${options.userId} failed`, sendError);
    await supabase.from("notification_log").update({ status: "failed" }).eq("id", log.id);
    return "failed";
  }
}

import "server-only";
import { getConfig } from "@/lib/config";
import {
  apnsPayload,
  createApnsProvider,
  fakePushProvider,
  type PushEnvironment,
  type PushMessage,
  type PushProvider,
} from "@/lib/notify/push";
import { createServiceClient } from "@/lib/supabase/service";
import { localDateString } from "@/lib/time";

/**
 * The iOS app's devices and the pushes sent to them (docs/plans/ios-app.md,
 * phase 5). Every push attempt is logged in notification_log (channel
 * `push`), like emails. Demo profiles, and members who turned notifications
 * off, are never pushed.
 */

let cachedProvider: PushProvider | null | undefined;

/** The configured provider, or null when pushes are off (`PUSH_PROVIDER=none`). */
function provider(): PushProvider | null {
  if (cachedProvider === undefined) {
    const config = getConfig();
    cachedProvider =
      config.PUSH_PROVIDER === "apns"
        ? createApnsProvider({
            keyId: config.APNS_KEY_ID!,
            teamId: config.APNS_TEAM_ID,
            privateKey: config.APNS_PRIVATE_KEY!,
            bundleId: config.APNS_BUNDLE_ID,
          })
        : config.PUSH_PROVIDER === "fake"
          ? fakePushProvider
          : null;
  }
  return cachedProvider;
}

/** Keeps this phone's token for the user. A token seen on another account moves to this one. */
export async function registerDevice(userId: string, token: string, environment: PushEnvironment) {
  const { error } = await createServiceClient()
    .from("push_devices")
    .upsert(
      { token, user_id: userId, environment, updated_at: new Date().toISOString() },
      { onConflict: "token" },
    );
  if (error) throw new Error(`registerDevice: ${error.message}`);
}

/** Forgets a token, only if it is the user's own (signing out of the app). */
export async function removeDevice(userId: string, token: string) {
  const { error } = await createServiceClient()
    .from("push_devices")
    .delete()
    .eq("token", token)
    .eq("user_id", userId);
  if (error) throw new Error(`removeDevice: ${error.message}`);
}

/**
 * Pushes a message to every phone of a user. "skipped" when there is nothing
 * to send to (no phone, pushes off, a demo profile, notifications turned
 * off): callers then fall back to email. Tokens Apple says are gone are
 * forgotten. Never throws.
 */
export async function pushTo(
  userId: string,
  message: PushMessage,
  badge: number,
): Promise<"sent" | "skipped" | "failed"> {
  const push = provider();
  if (!push) return "skipped";
  const supabase = createServiceClient();
  try {
    const [{ data: user, error }, { data: devices, error: devicesError }] = await Promise.all([
      supabase.from("users").select("notify_channel, is_demo").eq("id", userId).maybeSingle(),
      supabase.from("push_devices").select("token, environment").eq("user_id", userId),
    ]);
    if (error || devicesError) throw new Error((error ?? devicesError)!.message);
    if (!user || user.is_demo || user.notify_channel === "none" || !devices?.length) {
      return "skipped";
    }

    const payload = apnsPayload(message, badge);
    const results = await Promise.all(
      devices.map(async (device) => ({
        token: device.token,
        result: await push.send({
          token: device.token,
          environment: device.environment as PushEnvironment,
          payload,
          collapseId: `${message.kind}-${message.matchId}`.slice(0, 64),
        }),
      })),
    );
    const gone = results.filter(({ result }) => !result.ok && result.gone).map((r) => r.token);
    if (gone.length) await supabase.from("push_devices").delete().in("token", gone);
    const sent = results.some(({ result }) => result.ok);
    for (const { result } of results) {
      if (!result.ok) console.error(`push: ${message.kind} to ${userId} failed`, result.reason);
    }

    await supabase.from("notification_log").insert({
      user_id: userId,
      channel: "push",
      kind: message.kind,
      local_date: localDateString(getConfig().APP_TIMEZONE),
      payload: {
        match_id: message.matchId,
        devices: results.length,
        delivered: results.filter(({ result }) => result.ok).length,
      },
      status: sent ? "sent" : "failed",
    });
    return sent ? "sent" : "failed";
  } catch (error) {
    console.error(`push: ${message.kind} to ${userId} failed`, error);
    return "failed";
  }
}

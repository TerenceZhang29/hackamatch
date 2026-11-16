import { createPrivateKey, randomUUID, sign } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { connect } from "node:http2";
import path from "node:path";

/**
 * Push notifications to the iOS app (docs/plans/ios-app.md, phase 5): the
 * messages, their APNs payloads, and the two providers: Apple's (token
 * auth with the team's .p8 key) and a fake that writes to `.tmp/push-outbox`.
 */

export type PushEnvironment = "sandbox" | "production";

export type PushMessage =
  | { kind: "inbound_interest"; variant: "interest" | "intro"; matchId: string; otherName: string }
  | { kind: "mutual"; matchId: string; otherName: string };

/** The category the app registers, with Interested and Pass buttons on the notification. */
export const INTEREST_CATEGORY = "MATCH_INTEREST";

/** What the notification says: the same wording as the emails. */
export function pushText(message: PushMessage): { title: string; body: string } {
  if (message.kind === "mutual") {
    return {
      title: "It's a match!",
      body: `You and ${message.otherName} are both interested. Say hi.`,
    };
  }
  return message.variant === "intro"
    ? { title: `Meet ${message.otherName}`, body: "We think you two should build together." }
    : {
        title: `${message.otherName} wants to build with you`,
        body: "Interested? Answer from here, or open HackaMatch.",
      };
}

/** The APNs JSON for a message. `badge` is the member's waiting count. */
export function apnsPayload(message: PushMessage, badge: number) {
  const { title, body } = pushText(message);
  return {
    aps: {
      alert: { title, body },
      sound: "default",
      badge,
      "thread-id": "matches",
      ...(message.kind === "inbound_interest" ? { category: INTEREST_CATEGORY } : {}),
    },
    kind: message.kind,
    matchId: message.matchId,
  };
}

export type ApnsPayload = ReturnType<typeof apnsPayload>;

export interface PushDelivery {
  token: string;
  environment: PushEnvironment;
  payload: ApnsPayload;
  /** Lets a newer notification for the same match replace this one. */
  collapseId: string;
}

/** `gone`: Apple says the token no longer works, so it should be forgotten. */
export type PushResult = { ok: true; id: string } | { ok: false; gone: boolean; reason: string };

export interface PushProvider {
  send(delivery: PushDelivery): Promise<PushResult>;
}

// The fake -----------------------------------------------------------------

/** Where the fake provider writes pushes: `<repo>/.tmp/push-outbox`. */
export const PUSH_OUTBOX_DIR = path.join(process.cwd(), ".tmp", "push-outbox");

/** Stand-in for APNs (`PUSH_PROVIDER=fake`): writes each push to `.tmp/push-outbox/<id>.json`. */
export const fakePushProvider: PushProvider = {
  async send(delivery) {
    const id = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
    await mkdir(PUSH_OUTBOX_DIR, { recursive: true });
    await writeFile(path.join(PUSH_OUTBOX_DIR, `${id}.json`), JSON.stringify(delivery, null, 2));
    return { ok: true, id };
  },
};

// APNs ---------------------------------------------------------------------

const base64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");

/**
 * The provider token APNs wants: a JWT signed with ES256 by the team's key.
 * Apple accepts one for an hour and refuses new ones more often than every
 * 20 minutes, so callers reuse it (see createApnsProvider).
 */
export function apnsJwt(options: {
  keyId: string;
  teamId: string;
  privateKey: string;
  issuedAt: number;
}): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: options.keyId }));
  const claims = base64url(JSON.stringify({ iss: options.teamId, iat: options.issuedAt }));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(options.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${claims}.${base64url(signature)}`;
}

/** A .p8 key pasted into an env var, with real or escaped newlines. */
export function normalizePrivateKey(value: string): string {
  return value.replaceAll("\\n", "\n").trim();
}

const HOSTS: Record<PushEnvironment, string> = {
  sandbox: "https://api.sandbox.push.apple.com",
  production: "https://api.push.apple.com",
};

/** Reasons APNs gives when a token will never work again. */
const GONE = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

export function createApnsProvider(options: {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
}): PushProvider {
  let cached: { token: string; at: number } | null = null;
  const jwt = () => {
    const now = Math.floor(Date.now() / 1000);
    // Renewed after 40 minutes: inside Apple's hour, outside its 20-minute floor.
    if (!cached || now - cached.at > 40 * 60) {
      cached = {
        token: apnsJwt({
          keyId: options.keyId,
          teamId: options.teamId,
          privateKey: normalizePrivateKey(options.privateKey),
          issuedAt: now,
        }),
        at: now,
      };
    }
    return cached.token;
  };

  return {
    send(delivery) {
      return new Promise<PushResult>((resolve) => {
        const session = connect(HOSTS[delivery.environment]);
        const done = (result: PushResult) => {
          session.close();
          resolve(result);
        };
        session.on("error", (error) => done({ ok: false, gone: false, reason: error.message }));
        const request = session.request({
          ":method": "POST",
          ":path": `/3/device/${delivery.token}`,
          authorization: `bearer ${jwt()}`,
          "apns-topic": options.bundleId,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "apns-collapse-id": delivery.collapseId,
          "content-type": "application/json",
        });
        request.setTimeout(10_000, () => {
          request.close();
          done({ ok: false, gone: false, reason: "timeout" });
        });
        let status = 0;
        let id = "";
        let body = "";
        request.on("response", (headers) => {
          status = Number(headers[":status"]);
          id = String(headers["apns-id"] ?? "");
        });
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => (body += chunk));
        request.on("end", () => {
          if (status === 200) return done({ ok: true, id });
          let reason = `status ${status}`;
          try {
            reason = (JSON.parse(body) as { reason?: string }).reason ?? reason;
          } catch {
            // No JSON body: keep the status.
          }
          done({ ok: false, gone: status === 410 || GONE.has(reason), reason });
        });
        request.on("error", (error) => done({ ok: false, gone: false, reason: error.message }));
        request.end(JSON.stringify(delivery.payload));
      });
    },
  };
}

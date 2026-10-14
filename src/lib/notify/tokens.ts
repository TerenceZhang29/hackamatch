import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed tokens for one-click email links. A token authorizes exactly one
 * action for one user (and, for match responses, one match) without a login.
 *
 * Format: base64url(JSON payload) "." base64url(HMAC-SHA256(payload, secret)).
 */

export const TOKEN_ACTIONS = ["interested", "pass", "pause"] as const;
export type TokenAction = (typeof TOKEN_ACTIONS)[number];

export interface TokenPayload {
  /** Match id; null for actions that are not about a match (pause). */
  matchId: string | null;
  userId: string;
  action: TokenAction;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

const DAY_SECONDS = 24 * 60 * 60;
/** Matches never expire, but links do; an expired link falls back to "sign in to respond". */
export const DEFAULT_TOKEN_DAYS = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mac(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

export function signToken(
  payload: Omit<TokenPayload, "exp"> & { exp?: number },
  secret: string,
  now: Date = new Date(),
): string {
  const full: TokenPayload = {
    ...payload,
    exp: payload.exp ?? Math.floor(now.getTime() / 1000) + DEFAULT_TOKEN_DAYS * DAY_SECONDS,
  };
  const data = Buffer.from(
    JSON.stringify({ m: full.matchId, u: full.userId, a: full.action, e: full.exp }),
  ).toString("base64url");
  return `${data}.${mac(data, secret).toString("base64url")}`;
}

export type VerifyResult =
  { ok: true; payload: TokenPayload } | { ok: false; reason: "invalid" | "expired" };

/** Checks the signature (in constant time), shape and expiry of a token. */
export function verifyToken(token: string, secret: string, now: Date = new Date()): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "invalid" };
  const [data, signature] = parts as [string, string];

  const expected = mac(data, secret);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "invalid" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const { m, u, a, e } = (raw ?? {}) as Record<string, unknown>;
  const valid =
    (m === null || (typeof m === "string" && UUID.test(m))) &&
    typeof u === "string" &&
    UUID.test(u) &&
    typeof a === "string" &&
    (TOKEN_ACTIONS as readonly string[]).includes(a) &&
    typeof e === "number" &&
    Number.isInteger(e) &&
    (a === "pause" ? m === null : m !== null);
  if (!valid) return { ok: false, reason: "invalid" };
  if (e * 1000 <= now.getTime()) return { ok: false, reason: "expired" };

  return {
    ok: true,
    payload: { matchId: m as string | null, userId: u, action: a as TokenAction, exp: e },
  };
}

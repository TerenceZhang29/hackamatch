import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "@/lib/notify/tokens";

const SECRET = "a-test-secret-that-is-at-least-32-chars";
const now = new Date("2026-10-14T12:00:00Z");
const ids = {
  matchId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
};

describe("signToken / verifyToken", () => {
  it("round-trips a match response token with a 30-day default expiry", () => {
    const token = signToken({ ...ids, action: "interested" }, SECRET, now);
    const result = verifyToken(token, SECRET, now);
    expect(result).toEqual({
      ok: true,
      payload: { ...ids, action: "interested", exp: now.getTime() / 1000 + 30 * 86400 },
    });
  });

  it("round-trips a pause token, which has no match", () => {
    const token = signToken({ matchId: null, userId: ids.userId, action: "pause" }, SECRET, now);
    expect(verifyToken(token, SECRET, now)).toMatchObject({
      ok: true,
      payload: { action: "pause" },
    });
  });

  it("rejects a token signed with another secret", () => {
    const token = signToken({ ...ids, action: "pass" }, "another-secret-another-secret-123", now);
    expect(verifyToken(token, SECRET, now)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a tampered payload", () => {
    const token = signToken({ ...ids, action: "pass" }, SECRET, now);
    const [data, signature] = token.split(".");
    const payload = JSON.parse(Buffer.from(data!, "base64url").toString());
    payload.a = "interested";
    const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;
    expect(verifyToken(forged, SECRET, now)).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports an expired token as expired", () => {
    const token = signToken(
      { ...ids, action: "interested", exp: now.getTime() / 1000 - 1 },
      SECRET,
    );
    expect(verifyToken(token, SECRET, now)).toEqual({ ok: false, reason: "expired" });
  });

  it.each(["", "abc", "a.b.c", "!!!.???", `${Buffer.from("{}").toString("base64url")}.x`])(
    "rejects malformed token %j",
    (token) => {
      expect(verifyToken(token, SECRET, now)).toEqual({ ok: false, reason: "invalid" });
    },
  );

  it("rejects a well-signed payload of the wrong shape", () => {
    // A pause token must not carry a match, and a response token must.
    const pauseWithMatch = signToken({ ...ids, action: "pause" }, SECRET, now);
    const responseWithoutMatch = signToken(
      { matchId: null, userId: ids.userId, action: "interested" },
      SECRET,
      now,
    );
    expect(verifyToken(pauseWithMatch, SECRET, now).ok).toBe(false);
    expect(verifyToken(responseWithoutMatch, SECRET, now).ok).toBe(false);
  });
});

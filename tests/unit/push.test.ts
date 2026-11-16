import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  apnsJwt,
  apnsPayload,
  INTEREST_CATEGORY,
  normalizePrivateKey,
  pushText,
} from "@/lib/notify/push";
import { parseConfig } from "@/lib/config";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  APP_URL: "http://localhost:3000",
};
const production = {
  ...base,
  NODE_ENV: "production",
  ANTHROPIC_API_KEY: "a",
  VOYAGE_API_KEY: "v",
  RESEND_API_KEY: "r",
  EMAIL_FROM: "HackaMatch <hello@hackamatch.com>",
  RESPONSE_TOKEN_SECRET: "x".repeat(32),
  CRON_SECRET: "c",
};

describe("push messages", () => {
  it("say the same as the emails", () => {
    expect(pushText({ kind: "mutual", matchId: "m", otherName: "Maya" })).toEqual({
      title: "It's a match!",
      body: "You and Maya are both interested. Say hi.",
    });
    expect(
      pushText({ kind: "inbound_interest", variant: "interest", matchId: "m", otherName: "Maya" })
        .title,
    ).toBe("Maya wants to build with you");
    expect(
      pushText({ kind: "inbound_interest", variant: "intro", matchId: "m", otherName: "Maya" })
        .title,
    ).toBe("Meet Maya");
  });

  it("put Interested and Pass on interest only, with the match and the badge", () => {
    const interest = apnsPayload(
      { kind: "inbound_interest", variant: "interest", matchId: "m1", otherName: "Maya" },
      2,
    );
    expect(interest.aps.category).toBe(INTEREST_CATEGORY);
    expect(interest.aps.badge).toBe(2);
    expect(interest).toMatchObject({ kind: "inbound_interest", matchId: "m1" });
    const mutual = apnsPayload({ kind: "mutual", matchId: "m1", otherName: "Maya" }, 0);
    expect(mutual.aps).not.toHaveProperty("category");
  });

  it("never carry an email address", () => {
    const payload = JSON.stringify(
      apnsPayload({ kind: "mutual", matchId: "m1", otherName: "Maya" }, 1),
    );
    expect(payload).not.toContain("@");
  });
});

describe("the APNs provider token", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

  it("is an ES256 JWT for the team and key, which the key's public half verifies", () => {
    const jwt = apnsJwt({
      keyId: "KEY1234567",
      teamId: "TEAM123456",
      privateKey: pem,
      issuedAt: 100,
    });
    const [header, claims, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "KEY1234567",
    });
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString())).toEqual({
      iss: "TEAM123456",
      iat: 100,
    });
    const valid = verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature!, "base64url"),
    );
    expect(valid).toBe(true);
  });

  it("reads a key pasted with escaped newlines", () => {
    expect(normalizePrivateKey(pem.replaceAll("\n", "\\n"))).toBe(pem.trim());
  });
});

describe("push config", () => {
  it("is fake locally, off in production until the key is set, then APNs", () => {
    expect(parseConfig(base).PUSH_PROVIDER).toBe("fake");
    expect(parseConfig(production).PUSH_PROVIDER).toBe("none");
    const live = parseConfig({ ...production, APNS_PRIVATE_KEY: "k", APNS_KEY_ID: "KEY1234567" });
    expect(live.PUSH_PROVIDER).toBe("apns");
    expect(live.APNS_TEAM_ID).toBe("5B89U2CMF9");
    expect(live.APNS_BUNDLE_ID).toBe("com.hackamatch.app");
  });

  it("refuses APNs without the key id", () => {
    expect(() => parseConfig({ ...production, APNS_PRIVATE_KEY: "k" })).toThrow(/APNS_KEY_ID/);
  });
});

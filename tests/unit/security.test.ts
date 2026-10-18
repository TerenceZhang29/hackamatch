import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "@/lib/csp";
import { clientIp, limitKey, LIMITS } from "@/lib/rate-limit";

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe("clientIp", () => {
  it("takes the first forwarded address, then x-real-ip, then a shared bucket", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(headers({ "x-real-ip": " 198.51.100.2 " }))).toBe("198.51.100.2");
    expect(clientIp(headers({}))).toBe("unknown");
  });
});

describe("limitKey", () => {
  it("normalizes the subject so case can't dodge a limit", () => {
    expect(limitKey(LIMITS.loginEmail, " UT-301@Cornell.edu ")).toBe(
      "login:email:ut-301@cornell.edu",
    );
  });
});

describe("contentSecurityPolicy", () => {
  const base = { nonce: "abc123", supabaseUrl: "https://x.supabase.co", dev: false, https: true };

  it("requires the nonce for scripts and blocks framing, plugins and foreign forms", () => {
    const csp = contentSecurityPolicy(base);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("connect-src 'self' https://x.supabase.co");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("allows eval only in development, and upgrades requests only over https", () => {
    const dev = contentSecurityPolicy({ ...base, dev: true, https: false });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
});

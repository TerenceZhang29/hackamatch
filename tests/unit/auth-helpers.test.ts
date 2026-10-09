import { describe, expect, it } from "vitest";
import {
  isAllowedEmailDomain,
  isProtectedPath,
  loginPath,
  normalizeEmail,
  sanitizeNext,
} from "@/lib/auth-helpers";

describe("sanitizeNext", () => {
  it("keeps same-site relative paths, with query and hash", () => {
    expect(sanitizeNext("/")).toBe("/");
    expect(sanitizeNext("/ideas/123")).toBe("/ideas/123");
    expect(sanitizeNext("/matches?tab=new#top")).toBe("/matches?tab=new#top");
  });

  it.each([
    ["absolute URL", "https://evil.com"],
    ["absolute URL with path", "https://evil.com/matches"],
    ["protocol-relative URL", "//evil.com"],
    ["backslash host", "/\\evil.com"],
    ["backslash after slash", "/\\/evil.com"],
    ["tab that parsers strip", "/\t/evil.com"],
    ["newline that parsers strip", "/\n/evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["path without leading slash", "matches"],
    ["empty string", ""],
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s", (_label, value) => {
    expect(sanitizeNext(value)).toBeNull();
  });

  it("rejects auth routes so login cannot loop", () => {
    expect(sanitizeNext("/login")).toBeNull();
    expect(sanitizeNext("/login?next=/matches")).toBeNull();
    expect(sanitizeNext("/logout")).toBeNull();
    expect(sanitizeNext("/auth/callback?code=abc")).toBeNull();
  });

  it("normalizes dot segments instead of trusting them", () => {
    expect(sanitizeNext("/ideas/../matches")).toBe("/matches");
    expect(sanitizeNext("/ideas/../login")).toBeNull();
  });
});

describe("loginPath", () => {
  it("carries a safe next", () => {
    expect(loginPath("/ideas/new")).toBe("/login?next=%2Fideas%2Fnew");
    expect(loginPath("/matches?tab=new")).toBe("/login?next=%2Fmatches%3Ftab%3Dnew");
  });

  it("drops an unsafe or missing next", () => {
    expect(loginPath("https://evil.com")).toBe("/login");
    expect(loginPath()).toBe("/login");
  });
});

describe("isAllowedEmailDomain", () => {
  const allowed = ["cornell.edu"];

  it("accepts an allowed domain regardless of case or surrounding space", () => {
    expect(isAllowedEmailDomain("abc123@cornell.edu", allowed)).toBe(true);
    expect(isAllowedEmailDomain("  ABC123@Cornell.EDU ", allowed)).toBe(true);
  });

  it("rejects other domains, lookalikes and subdomains", () => {
    expect(isAllowedEmailDomain("abc123@gmail.com", allowed)).toBe(false);
    expect(isAllowedEmailDomain("abc123@notcornell.edu", allowed)).toBe(false);
    expect(isAllowedEmailDomain("abc123@cornell.edu.evil.com", allowed)).toBe(false);
    expect(isAllowedEmailDomain("abc123@tech.cornell.edu", allowed)).toBe(false);
    expect(isAllowedEmailDomain("cornell.edu@gmail.com", allowed)).toBe(false);
  });

  it("uses the domain after the last @", () => {
    expect(isAllowedEmailDomain("abc@cornell.edu@gmail.com", allowed)).toBe(false);
  });

  it("rejects malformed input and an empty allow-list", () => {
    expect(isAllowedEmailDomain("@cornell.edu", allowed)).toBe(false);
    expect(isAllowedEmailDomain("cornell.edu", allowed)).toBe(false);
    expect(isAllowedEmailDomain("abc123@cornell.edu", [])).toBe(false);
  });

  it("supports several allowed domains", () => {
    const many = ["cornell.edu", "Tech.Cornell.edu"];
    expect(isAllowedEmailDomain("abc123@tech.cornell.edu", many)).toBe(true);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  ABC123@Cornell.EDU ")).toBe("abc123@cornell.edu");
  });
});

describe("isProtectedPath", () => {
  it.each(["/me", "/matches", "/matches/abc", "/ideas/new", "/organizer/events", "/admin"])(
    "protects %s",
    (path) => {
      expect(isProtectedPath(path)).toBe(true);
    },
  );

  it.each(["/", "/login", "/ideas/abc", "/e/big-red-hacks", "/measure", "/administrator"])(
    "leaves %s public",
    (path) => {
      expect(isProtectedPath(path)).toBe(false);
    },
  );
});

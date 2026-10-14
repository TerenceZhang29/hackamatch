import { describe, expect, it } from "vitest";
import { cleanLinkedinText, LINKEDIN_TEXT_MAX, normalizeLinkedinUrl } from "@/lib/imports/linkedin";

describe("normalizeLinkedinUrl", () => {
  it.each([
    ["https://www.linkedin.com/in/maya-patel", "https://www.linkedin.com/in/maya-patel"],
    ["linkedin.com/in/maya-patel/", "https://www.linkedin.com/in/maya-patel"],
    ["https://uk.linkedin.com/in/maya_patel-123", "https://www.linkedin.com/in/maya_patel-123"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeLinkedinUrl(input)).toBe(expected);
  });

  it.each([
    "https://www.linkedin.com/company/cornell-tech",
    "https://linkedin.com.evil.com/in/maya",
    "https://notlinkedin.com/in/maya",
    "https://www.linkedin.com/in/ab",
    "maya",
  ])("rejects %s", (input) => {
    expect(normalizeLinkedinUrl(input)).toBeNull();
  });
});

describe("cleanLinkedinText", () => {
  it("trims and caps pasted text", () => {
    expect(cleanLinkedinText("  Product designer  \n")).toBe("Product designer");
    expect(cleanLinkedinText("x".repeat(LINKEDIN_TEXT_MAX + 50))).toHaveLength(LINKEDIN_TEXT_MAX);
    expect(cleanLinkedinText("   ")).toBeNull();
  });
});

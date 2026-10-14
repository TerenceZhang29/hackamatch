import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it.each([
    ["Cornell Tech Fall Hack!", "cornell-tech-fall-hack"],
    ["  Health AI  Buildathon 2026 ", "health-ai-buildathon-2026"],
    ["Café Hackathon", "cafe-hackathon"],
    ["!!!", "event"],
    ["x".repeat(80), "x".repeat(60)],
  ])("%j → %j", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it("matches the events.slug check constraint", () => {
    for (const name of ["A -- B", "-leading", "trailing-", "Mixed CASE 99"]) {
      expect(slugify(name)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

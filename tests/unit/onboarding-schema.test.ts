import { describe, expect, it } from "vitest";
import { joinPoolInputSchema, sentenceInputSchema } from "@/app/(focus)/onboarding/schema";

describe("sentenceInputSchema", () => {
  it("accepts the minimum a builder gives", () => {
    const parsed = sentenceInputSchema.parse({
      role: "builder",
      intents: ["hackathon", "hackathon"],
      sentence: "  I build iOS apps  ",
    });
    expect(parsed).toEqual({
      role: "builder",
      intents: ["hackathon"],
      name: null,
      sentence: "I build iOS apps",
      githubUrl: null,
      linkedinUrl: null,
      linkedinText: null,
    });
  });

  it("treats a blank name as no name", () => {
    const parsed = sentenceInputSchema.parse({
      role: "idea",
      intents: ["cofounder"],
      name: "   ",
      sentence: "An app for nurses",
    });
    expect(parsed.name).toBeNull();
  });

  it("rejects an unknown role, no intents, or an empty sentence", () => {
    expect(
      sentenceInputSchema.safeParse({
        role: "investor",
        intents: ["hackathon"],
        sentence: "Hi there",
      }).success,
    ).toBe(false);
    expect(
      sentenceInputSchema.safeParse({ role: "idea", intents: [], sentence: "An app for nurses" })
        .success,
    ).toBe(false);
    expect(
      sentenceInputSchema.safeParse({ role: "idea", intents: ["hackathon"], sentence: "  " })
        .success,
    ).toBe(false);
  });

  it("accepts a GitHub profile instead of a sentence", () => {
    const parsed = sentenceInputSchema.parse({
      role: "builder",
      intents: ["hackathon"],
      githubUrl: " github.com/octocat ",
    });
    expect(parsed).toMatchObject({ sentence: "", githubUrl: "github.com/octocat" });
  });

  it("rejects import links that are not profiles", () => {
    const base = { role: "builder", intents: ["hackathon"], sentence: "I build iOS apps" } as const;
    expect(
      sentenceInputSchema.safeParse({ ...base, githubUrl: "https://example.com/me" }).success,
    ).toBe(false);
    expect(
      sentenceInputSchema.safeParse({ ...base, linkedinUrl: "linkedin.com/company/x" }).success,
    ).toBe(false);
  });

  it("caps the sentence length", () => {
    const result = sentenceInputSchema.safeParse({
      role: "idea",
      intents: ["hackathon"],
      sentence: "x".repeat(601),
    });
    expect(result.success).toBe(false);
  });
});

describe("joinPoolInputSchema", () => {
  const tags = { skills: ["frontend"], stack: ["react"], domains: [] };

  it("fills defaults for the optional fields", () => {
    expect(joinPoolInputSchema.parse({ tags })).toEqual({
      tags,
      eventIds: [],
      ideaId: null,
      clarifyingAnswer: null,
      next: null,
    });
  });

  it("treats a blank clarifying answer as none", () => {
    expect(joinPoolInputSchema.parse({ tags, clarifyingAnswer: "  " }).clarifyingAnswer).toBeNull();
  });

  it("rejects malformed ids and oversized tag lists", () => {
    expect(joinPoolInputSchema.safeParse({ tags, eventIds: ["not-a-uuid"] }).success).toBe(false);
    expect(joinPoolInputSchema.safeParse({ tags, ideaId: "42" }).success).toBe(false);
    expect(
      joinPoolInputSchema.safeParse({
        tags: { ...tags, skills: Array.from({ length: 31 }, (_, i) => `tag-${i}`) },
      }).success,
    ).toBe(false);
  });
});

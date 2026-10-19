import { describe, expect, it, vi } from "vitest";
import { slugsOf } from "@/lib/taxonomy/skills";

vi.mock("@/lib/config", () => ({ getConfig: () => ({ LLM_PROVIDER: "fake" }) }));

const { extractProfile } = await import("@/lib/llm/extract-profile");
const { extractIdea } = await import("@/lib/llm/extract-idea");
const { fakeLlm, fakePitch } = await import("@/lib/llm/fake");
const { LlmError } = await import("@/lib/llm/client");
const { profileSystemPrompt, ideaSystemPrompt } = await import("@/lib/llm/prompts");
const { z } = await import("zod");

describe("extractProfile with the fake LLM", () => {
  it("infers stack and domains from a builder's sentence", async () => {
    const profile = await extractProfile({
      role: "builder",
      sentence: "I build React and Python apps, mostly health stuff",
    });
    expect(profile.stack).toEqual(expect.arrayContaining(["react", "python"]));
    expect(profile.domains).toEqual(expect.arrayContaining(["health"]));
    expect(profile.experience_level).toBe("intermediate");
    expect(profile.summary).not.toBe("");
    expect(profile.idea).toBeNull();
  });

  it("is deterministic", async () => {
    const input = { role: "builder", sentence: "iOS apps in Swift, fintech" } as const;
    expect(await extractProfile(input)).toEqual(await extractProfile(input));
  });

  it("extracts an idea for an idea person", async () => {
    const profile = await extractProfile({
      role: "idea",
      sentence: "A mobile app that helps nurses swap shifts at short notice, for a hackathon",
    });
    expect(profile.idea).toMatchObject({
      domain: null,
      skills_needed: ["mobile"],
      scope: "weekend",
      clarifying_question: null,
    });
    expect(profile.idea?.pitch).toContain("nurses");
  });

  it("extracts an idea for 'both' only when the sentence describes a product", async () => {
    const withProduct = await extractProfile({
      role: "both",
      sentence: "I want to build a tutoring marketplace and I can do the backend",
    });
    expect(withProduct.idea).not.toBeNull();
    expect(withProduct.skills).toContain("backend");

    const withoutProduct = await extractProfile({
      role: "both",
      sentence: "Backend engineer who likes climate projects",
    });
    expect(withoutProduct.idea).toBeNull();
  });

  it("reads imported GitHub and LinkedIn text", async () => {
    const profile = await extractProfile({
      role: "builder",
      sentence: "I like building things",
      githubSummary: "Languages: Rust, TypeScript",
      linkedinText: "5 years in machine learning at a fintech startup",
    });
    expect(profile.stack).toEqual(expect.arrayContaining(["rust", "typescript"]));
    expect(profile.skills).toContain("ml");
    expect(profile.domains).toContain("fintech");
    expect(profile.experience_level).toBe("advanced");
  });

  it("does not read everyday words as tags", async () => {
    const profile = await extractProfile({
      role: "builder",
      sentence: "I want to go express myself and excel next spring",
    });
    expect(profile.stack).toEqual([]);
  });
});

describe("extractIdea with the fake LLM", () => {
  it("returns pitch, tags and scope", async () => {
    const idea = await extractIdea({
      text: "A climate dashboard for campus buildings that needs frontend and data analysis help, as a startup",
    });
    expect(idea.domain).toBe("climate");
    expect(idea.skills_needed).toEqual(expect.arrayContaining(["frontend", "data-analysis"]));
    expect(idea.scope).toBe("ongoing");
    expect(idea.clarifying_question).toBeNull();
    expect(idea.pitch.split(/\s+/).length).toBeLessThanOrEqual(20);
  });

  it("asks one short question when the idea is vague", async () => {
    const idea = await extractIdea({ text: "Uber for dogs" });
    expect(idea.clarifying_question).toBeTruthy();
    expect(idea.clarifying_question!.split(/\s+/).length).toBeLessThanOrEqual(15);
  });
});

describe("fakePitch", () => {
  it("keeps a short first sentence whole", () => {
    expect(fakePitch("let nurses swap shifts in minutes. Also more detail here.")).toBe(
      "Let nurses swap shifts in minutes.",
    );
  });

  it("stops a long one at a natural break, with an ellipsis", () => {
    const long =
      "I want to build a dashboard that tracks campus energy use with data visualization and backend engineer in go, building more";
    const pitch = fakePitch(long);
    expect(pitch.endsWith("…")).toBe(true);
    expect(pitch.split(/\s+/).length).toBeLessThanOrEqual(20);
    expect(pitch).not.toMatch(/\b(and|with|building|in)…$/);
    expect(
      fakePitch(
        "one two three four five six seven eight nine ten, and then more words keep going on and on until it is clearly too long",
      ),
    ).toBe("One two three four five six seven eight nine ten…");
  });
});

describe("fake LLM", () => {
  it("rejects a tool it has no rule for", async () => {
    await expect(
      fakeLlm.structured({ system: "", user: "", schema: z.object({}), toolName: "unknown" }),
    ).rejects.toBeInstanceOf(LlmError);
  });
});

describe("prompts", () => {
  it("list every taxonomy slug", () => {
    for (const prompt of [profileSystemPrompt(), ideaSystemPrompt()]) {
      for (const group of ["skills", "stack", "domains"] as const) {
        expect(prompt).toContain(slugsOf(group).join(", "));
      }
    }
  });
});

describe("llmEnum", () => {
  it("accepts a value wrapped in a stray pair of quotes", async () => {
    const { rawProfileSchema } = await import("@/lib/llm/extract-profile");
    const base = { summary: "s", skills: [], stack: [], domains: [], idea: null };
    expect(rawProfileSchema.parse({ ...base, experience_level: '"intermediate"' })).toMatchObject({
      experience_level: "intermediate",
    });
    expect(rawProfileSchema.safeParse({ ...base, experience_level: "expert" }).success).toBe(false);
  });

  it("still sends the model a plain enum", async () => {
    const { rawIdeaSchema } = await import("@/lib/llm/extract-idea");
    const jsonSchema = z.toJSONSchema(rawIdeaSchema) as { properties: Record<string, unknown> };
    expect(jsonSchema.properties.scope).toMatchObject({
      enum: ["weekend", "few_weeks", "ongoing"],
    });
  });
});

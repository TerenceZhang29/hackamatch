import { beforeEach, describe, expect, it, vi } from "vitest";

const embed = vi.fn();
vi.mock("@/lib/embeddings", () => ({ embed }));

// Minimal stand-in for the supabase-js query builder: records updates and
// answers `.single()` from the rows below.
const rows: Record<string, { data: unknown; error: { message: string } | null }> = {};
const updates: { table: string; values: Record<string, unknown>; column: string; id: string }[] =
  [];
const createServiceClient = vi.fn(() => ({
  from: (table: string) => ({
    select: () => ({ eq: () => ({ single: async () => rows[table] }) }),
    update: (values: Record<string, unknown>) => ({
      eq: async (column: string, id: string) => {
        updates.push({ table, values, column, id });
        return { error: null };
      },
    }),
  }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient }));

const { embedIdea, embedProfile, ideaEmbeddingText, profileEmbeddingText } =
  await import("@/server/embed");

const user = { raw_bio: "I build iOS apps in Swift" };
const profile = { skills: ["ios", "mobile"], stack: ["swift"], domains: ["health"] };
const idea = {
  raw_text: "An app that helps nurses swap shifts",
  domain: "health",
  skills_needed: ["mobile", "backend"],
};

beforeEach(() => {
  embed.mockReset();
  updates.length = 0;
  for (const key of Object.keys(rows)) delete rows[key];
});

describe("profileEmbeddingText", () => {
  it("lists the tags and the bio, with no role or goals (P1-24)", () => {
    expect(profileEmbeddingText(user, profile)).toBe(
      "Skills: ios, mobile Stack: swift Domains: health About: I build iOS apps in Swift",
    );
  });

  it("appends the GitHub summary to the bio", () => {
    expect(profileEmbeddingText(user, profile, "Languages: Swift, Python")).toMatch(
      /About: I build iOS apps in Swift Languages: Swift, Python$/,
    );
  });

  it("leaves out empty sections", () => {
    const text = profileEmbeddingText(
      { raw_bio: null },
      { skills: [], stack: ["react"], domains: [] },
    );
    expect(text).toBe("Stack: react");
  });
});

describe("ideaEmbeddingText", () => {
  it("lists the idea, its domain and the skills it needs", () => {
    expect(ideaEmbeddingText(idea)).toBe(
      "Idea: An app that helps nurses swap shifts Domain: health Needs: mobile, backend",
    );
  });

  it("leaves out empty sections", () => {
    expect(ideaEmbeddingText({ raw_text: "Uber for dogs", domain: null, skills_needed: [] })).toBe(
      "Idea: Uber for dogs",
    );
  });
});

describe("embedProfile", () => {
  it("embeds the profile text as a document and stores the vector", async () => {
    rows.users = { data: user, error: null };
    rows.profiles = { data: profile, error: null };
    embed.mockResolvedValue([[0.25, -0.5, 1]]);

    await embedProfile("user-1", { githubSummary: "Languages: Swift" });

    expect(embed).toHaveBeenCalledWith(
      [profileEmbeddingText(user, profile, "Languages: Swift")],
      "document",
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ table: "profiles", column: "user_id", id: "user-1" });
    expect(updates[0]?.values.embedding).toBe("[0.25,-0.5,1]");
    expect(updates[0]?.values.embedded_at).toEqual(expect.any(String));
  });

  it("uses the stored GitHub summary when none is passed", async () => {
    rows.users = { data: user, error: null };
    rows.profiles = { data: { ...profile, github_summary: "Languages: Go" }, error: null };
    embed.mockResolvedValue([[1]]);

    await embedProfile("user-1");

    expect(embed).toHaveBeenCalledWith(
      [profileEmbeddingText(user, profile, "Languages: Go")],
      "document",
    );
  });

  it("throws when the user is missing, without embedding", async () => {
    rows.users = { data: null, error: { message: "no rows" } };
    rows.profiles = { data: profile, error: null };

    await expect(embedProfile("user-1")).rejects.toThrow(/no rows/);
    expect(embed).not.toHaveBeenCalled();
  });
});

describe("embedIdea", () => {
  it("embeds the idea text as a document and stores the vector", async () => {
    rows.ideas = { data: idea, error: null };
    embed.mockResolvedValue([[1, 0]]);

    await embedIdea("idea-1");

    expect(embed).toHaveBeenCalledWith([ideaEmbeddingText(idea)], "document");
    expect(updates).toEqual([
      { table: "ideas", values: { embedding: "[1,0]" }, column: "id", id: "idea-1" },
    ]);
  });
});

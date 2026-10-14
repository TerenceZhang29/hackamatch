import { describe, expect, it } from "vitest";
import { ideaTagsSchema, postIdeaSchema, previewSchema } from "@/app/ideas/schema";

describe("idea schemas", () => {
  it("needs a real sentence to preview", () => {
    expect(previewSchema.safeParse({ text: "short" }).success).toBe(false);
    expect(previewSchema.safeParse({ text: "An app that helps nurses swap shifts" }).success).toBe(
      true,
    );
  });

  it("fills post defaults and drops a blank answer", () => {
    expect(
      postIdeaSchema.parse({ text: "An app that helps nurses swap shifts", answer: "  " }),
    ).toEqual({
      text: "An app that helps nurses swap shifts",
      eventId: null,
      preview: null,
      answer: null,
    });
  });

  it("caps the client-sent preview", () => {
    const preview = {
      pitch: "x".repeat(201),
      domain: null,
      skills_needed: [],
      scope: "weekend",
      clarifying_question: null,
    };
    expect(
      postIdeaSchema.safeParse({ text: "An app that helps nurses swap shifts", preview }).success,
    ).toBe(false);
  });

  it("validates tag edits", () => {
    const base = {
      ideaId: crypto.randomUUID(),
      skillsNeeded: ["frontend"],
      domain: null,
      scope: null,
    };
    expect(ideaTagsSchema.safeParse(base).success).toBe(true);
    expect(ideaTagsSchema.safeParse({ ...base, scope: "forever" }).success).toBe(false);
    expect(ideaTagsSchema.safeParse({ ...base, ideaId: "nope" }).success).toBe(false);
  });
});

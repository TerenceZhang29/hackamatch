import { describe, expect, it } from "vitest";
import { hasSkill, onboardingOutcome, QUICK_SKILLS } from "@/lib/onboarding";
import { slugsOf } from "@/lib/taxonomy/skills";

const none = { skills: [], stack: [] };
const skill = { skills: ["backend"], stack: [] };
const tool = { skills: [], stack: ["python"] };

describe("onboardingOutcome", () => {
  it("keeps the role when there is an idea, with or without skills", () => {
    expect(onboardingOutcome("idea", true, none)).toEqual({ ok: true, role: "idea" });
    expect(onboardingOutcome("both", true, skill)).toEqual({ ok: true, role: "both" });
  });

  it("makes anyone without an idea a builder, when they have a skill or a tool", () => {
    expect(onboardingOutcome("idea", false, skill)).toEqual({ ok: true, role: "builder" });
    expect(onboardingOutcome("both", false, tool)).toEqual({ ok: true, role: "builder" });
    expect(onboardingOutcome("builder", false, skill)).toEqual({ ok: true, role: "builder" });
  });

  it("blocks joining with no idea and no skill", () => {
    for (const role of ["idea", "builder", "both"] as const) {
      expect(onboardingOutcome(role, false, none)).toEqual({ ok: false });
    }
  });

  it("counts only taxonomy tags as skills; areas alone don't count", () => {
    expect(hasSkill({ skills: ["not-a-real-skill"], stack: [] })).toBe(false);
    expect(hasSkill({ skills: ["Back end"], stack: [] })).toBe(true);
  });
});

describe("QUICK_SKILLS", () => {
  it("are real skill slugs", () => {
    const skills = new Set(slugsOf("skills"));
    for (const slug of QUICK_SKILLS) expect(skills.has(slug)).toBe(true);
  });
});

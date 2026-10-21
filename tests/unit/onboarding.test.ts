import { describe, expect, it } from "vitest";
import { BLOCK_MESSAGES, hasSkill, onboardingOutcome, QUICK_SKILLS } from "@/lib/onboarding";
import { slugsOf } from "@/lib/taxonomy/skills";

type Tags = { skills: string[]; stack: string[] };
const none: Tags = { skills: [], stack: [] };
const skill = { skills: ["backend"], stack: [] };
const tool = { skills: [], stack: ["python"] };
const read = (hasIdea: boolean, tags: Tags = none) => ({ extracted: true, hasIdea, tags });
const reading = (tags: Tags = none) => ({ extracted: false, hasIdea: false, tags });

describe("onboardingOutcome: the idea route", () => {
  it("joins as an idea person only when an idea was found", () => {
    expect(onboardingOutcome("idea", read(true))).toEqual({ ok: true, role: "idea" });
    expect(onboardingOutcome("idea", read(true, skill))).toEqual({ ok: true, role: "idea" });
  });

  it("is blocked without an idea, even with skills", () => {
    expect(onboardingOutcome("idea", read(false))).toEqual({ ok: false, reason: "no-idea" });
    expect(onboardingOutcome("idea", read(false, skill))).toEqual({ ok: false, reason: "no-idea" });
  });

  it("waits while the AI is still reading, whatever the tags", () => {
    expect(onboardingOutcome("idea", reading(skill))).toEqual({
      ok: false,
      reason: "pending-idea",
    });
  });
});

describe("onboardingOutcome: the builder route", () => {
  it("joins with a skill or a tool, found or picked, read or not", () => {
    expect(onboardingOutcome("builder", read(false, skill))).toEqual({ ok: true, role: "builder" });
    expect(onboardingOutcome("builder", read(false, tool))).toEqual({ ok: true, role: "builder" });
    expect(onboardingOutcome("builder", reading(skill))).toEqual({ ok: true, role: "builder" });
  });

  it("a builder's draft idea doesn't count; without a skill it's blocked", () => {
    expect(onboardingOutcome("builder", read(true))).toEqual({ ok: false, reason: "no-skill" });
    expect(onboardingOutcome("builder", reading())).toEqual({
      ok: false,
      reason: "pending-builder",
    });
  });
});

describe("onboardingOutcome: 'both' from a page loaded before P1-22", () => {
  it("keeps P1-21's rule: an idea or a skill, and never blocks while reading", () => {
    expect(onboardingOutcome("both", read(true))).toEqual({ ok: true, role: "both" });
    expect(onboardingOutcome("both", read(false, skill))).toEqual({ ok: true, role: "builder" });
    expect(onboardingOutcome("both", read(false))).toEqual({ ok: false, reason: "no-skill" });
    expect(onboardingOutcome("both", reading())).toEqual({ ok: true, role: "both" });
  });
});

describe("messages and skills", () => {
  it("has a message for every reason", () => {
    for (const reason of ["no-idea", "no-skill", "pending-idea", "pending-builder"] as const) {
      expect(BLOCK_MESSAGES[reason]).toBeTruthy();
    }
  });

  it("counts only taxonomy tags as skills", () => {
    expect(hasSkill({ skills: ["not-a-real-skill"], stack: [] })).toBe(false);
    expect(hasSkill({ skills: ["Back end"], stack: [] })).toBe(true);
  });

  it("quick picks are real skill slugs", () => {
    const skills = new Set(slugsOf("skills"));
    for (const slug of QUICK_SKILLS) expect(skills.has(slug)).toBe(true);
  });
});

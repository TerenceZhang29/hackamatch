import { describe, expect, it } from "vitest";
import { isMetaText, isPlaceholderText, neutralSummary } from "@/lib/llm/vague";

describe("isPlaceholderText", () => {
  it.each([
    "I want to build a xxx",
    "something",
    "tbd",
    "an app",
    "I want to make a cool app...",
    "zzz",
    "???",
  ])("is true for %j", (text) => expect(isPlaceholderText(text)).toBe(true));

  it.each([
    "A mobile app that helps nurses swap shifts",
    "Uber for dogs",
    "I build React and Python apps",
    "I want to build a study-group finder",
  ])("is false for %j", (text) => expect(isPlaceholderText(text)).toBe(false));
});

describe("isMetaText", () => {
  it.each([
    // The two strings production published on 2026-10-20 (P1-21).
    "Student wants to build a project but has not described it yet.",
    "Student wants to build something, but the text names no product, problem, or user.",
    "Student wants a marketplace for reselling textbooks; no personal skills stated.",
    "The description does not specify a product.",
  ])("is true for %j", (text) => expect(isMetaText(text)).toBe(true));

  it.each([
    "Builds web apps in JavaScript and works on database infrastructure.",
    "A mobile app that helps nurses swap shifts at short notice.",
    "An Airbnb-style service for bikes.",
    "Wants to build a project.",
  ])("is false for %j", (text) => expect(isMetaText(text)).toBe(false));
});

describe("neutralSummary", () => {
  const label = (slug: string) => slug.toUpperCase();
  const none = { skills: [], stack: [], domains: [] };

  it("says what the tags say", () => {
    expect(
      neutralSummary(
        "both",
        false,
        { skills: ["backend"], stack: ["python"], domains: ["health"] },
        label,
      ),
    ).toBe("Builds with PYTHON, BACKEND in HEALTH");
    expect(neutralSummary("idea", true, { ...none, domains: ["health"] }, label)).toBe(
      "Has an idea in HEALTH",
    );
  });

  it("is null when there's nothing to say", () => {
    expect(neutralSummary("both", false, none, label)).toBeNull();
  });
});

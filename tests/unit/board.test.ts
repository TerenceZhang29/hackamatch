import { describe, expect, it } from "vitest";
import { boardHref, hasFilters, PAGE_SIZE, parseBoardParams } from "@/lib/board";

describe("parseBoardParams", () => {
  it("defaults to the ideas tab with no filters", () => {
    expect(parseBoardParams({})).toEqual({
      tab: "ideas",
      filters: { event: null, domain: null, skill: null, intent: null },
      shown: PAGE_SIZE,
    });
  });

  it("reads known values and ignores unknown ones", () => {
    const state = parseBoardParams({
      tab: "people",
      event: "cornell-tech-fall-hack",
      domain: "health",
      skill: "react",
      intent: "cofounder",
      n: "40",
    });
    expect(state).toEqual({
      tab: "people",
      filters: {
        event: "cornell-tech-fall-hack",
        domain: "health",
        skill: "react",
        intent: "cofounder",
      },
      shown: 40,
    });

    const junk = parseBoardParams({
      tab: "admin",
      event: "Robert'); drop table",
      domain: "not-a-domain",
      skill: "",
      intent: "investor",
      n: "abc",
    });
    expect(junk).toEqual(parseBoardParams({}));
  });

  it("rounds the page size to whole pages and caps it", () => {
    expect(parseBoardParams({ n: "25" }).shown).toBe(40);
    expect(parseBoardParams({ n: "5" }).shown).toBe(PAGE_SIZE);
    expect(parseBoardParams({ n: "100000" }).shown).toBe(100);
  });

  it("takes the first value of a repeated parameter", () => {
    expect(parseBoardParams({ domain: ["health", "climate"] }).filters.domain).toBe("health");
  });
});

describe("boardHref", () => {
  it("leaves defaults out and round-trips through parseBoardParams", () => {
    expect(boardHref(parseBoardParams({}))).toBe("/");
    const href = boardHref(parseBoardParams({ tab: "people", skill: "react", n: "40" }));
    expect(href).toBe("/?tab=people&skill=react&n=40");
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(boardHref(parseBoardParams(params))).toBe(href);
  });

  it("knows when filters are applied", () => {
    expect(hasFilters(parseBoardParams({}).filters)).toBe(false);
    expect(hasFilters(parseBoardParams({ intent: "hackathon" }).filters)).toBe(true);
  });
});

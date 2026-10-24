import { describe, expect, it } from "vitest";
import {
  boardHref,
  EVENT_PAGE_SIZE,
  hasFilters,
  MAX_SHOWN,
  PAGE_SIZE,
  parseBoardParams,
  parseShown,
  wantsDeck,
} from "@/lib/board";

describe("parseBoardParams", () => {
  it("defaults to no filters (people only, P1-24)", () => {
    expect(parseBoardParams({})).toEqual({
      filters: { event: null, domain: null, skill: null },
      shown: PAGE_SIZE,
      view: null,
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
      filters: {
        event: "cornell-tech-fall-hack",
        domain: "health",
        skill: "react",
      },
      shown: 40,
      view: null,
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
    expect(href).toBe("/?skill=react&n=40");
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(boardHref(parseBoardParams(params))).toBe(href);
  });

  it("knows when filters are applied", () => {
    expect(hasFilters(parseBoardParams({}).filters)).toBe(false);
    expect(hasFilters(parseBoardParams({ intent: "hackathon" }).filters)).toBe(false);
    expect(hasFilters(parseBoardParams({ domain: "health" }).filters)).toBe(true);
  });
});

describe("parseShown", () => {
  it("rounds up to whole pages, from one page to MAX_SHOWN", () => {
    expect(parseShown(undefined, EVENT_PAGE_SIZE)).toBe(12);
    expect(parseShown("24", EVENT_PAGE_SIZE)).toBe(24);
    expect(parseShown("13", EVENT_PAGE_SIZE)).toBe(24);
    expect(parseShown("1", EVENT_PAGE_SIZE)).toBe(12);
    expect(parseShown("-5", EVENT_PAGE_SIZE)).toBe(12);
    expect(parseShown("9999", EVENT_PAGE_SIZE)).toBe(MAX_SHOWN);
    expect(parseShown("lots", EVENT_PAGE_SIZE)).toBe(12);
    expect(parseShown(["36", "12"], EVENT_PAGE_SIZE)).toBe(36);
  });
});

describe("wantsDeck", () => {
  it("opens the deck for a plain visit or an event, and the list otherwise", () => {
    expect(wantsDeck({})).toBe(true);
    expect(wantsDeck({ event: "cornell-tech-fall-hack" })).toBe(true);
    expect(wantsDeck({ matched: "x", sent: "1" })).toBe(true);
    expect(wantsDeck({ view: "list" })).toBe(false);
    for (const key of ["domain", "skill", "n"]) {
      expect(wantsDeck({ [key]: "x" }), key).toBe(false);
    }
    // Old tab and goal links open the deck now (P1-24).
    expect(wantsDeck({ tab: "people", intent: "x" })).toBe(true);
    expect(wantsDeck({ domain: "" })).toBe(true);
  });

  it("keeps the list view in board links", () => {
    const state = { ...parseBoardParams({ skill: "react" }), view: "list" as const };
    expect(boardHref(state)).toBe("/?skill=react&view=list");
  });
});

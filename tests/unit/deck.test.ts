import { describe, expect, it } from "vitest";
import {
  deckHref,
  leftLabel,
  orderFilterEvents,
  parsePassToken,
  passToken,
  sharedFirst,
} from "@/lib/deck";

describe("deckHref", () => {
  it("is / or narrowed to an event", () => {
    expect(deckHref(null)).toBe("/");
    expect(deckHref("cornell-tech-fall-hack")).toBe("/?event=cornell-tech-fall-hack");
  });
});

describe("the hackathon filter (P1-24)", () => {
  const ev = (id: string) => ({ id, slug: `s-${id}`, name: id });
  it("puts the selected event first, then the viewer's own, then the rest", () => {
    const events = [ev("a"), ev("b"), ev("c"), ev("d")];
    expect(orderFilterEvents(events, ["c"], null).map((e) => e.id)).toEqual(["c", "a", "b", "d"]);
    expect(orderFilterEvents(events, ["c"], "s-d").map((e) => e.id)).toEqual(["d", "c", "a", "b"]);
  });
});

describe("sharedFirst", () => {
  it("lists hackathons the viewer shares first, each group soonest first", () => {
    const events = [
      { id: "late", startDate: "2026-12-01" },
      { id: "shared", startDate: "2026-11-20" },
      { id: "soon", startDate: "2026-11-01" },
    ];
    expect(sharedFirst(events, ["shared"]).map((e) => [e.id, e.shared])).toEqual([
      ["shared", true],
      ["soon", false],
      ["late", false],
    ]);
  });
});

describe("pass tokens", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it("round-trip a card pass", () => {
    expect(parsePassToken(passToken("idea", id))).toEqual({ kind: "idea", targetId: id });
    expect(parsePassToken(passToken("person", id))).toEqual({ kind: "person", targetId: id });
  });

  it("still read a bare match id from before per-card passes", () => {
    expect(parsePassToken(id)).toEqual({ matchId: id });
  });

  it("refuse anything else", () => {
    for (const bad of ["team:" + id, "idea:not-a-uuid", "", undefined, 42]) {
      expect(parsePassToken(bad)).toBeNull();
    }
  });
});

describe("leftLabel", () => {
  it("shows a + when there are more than it looked ahead", () => {
    expect(leftLabel(1, false)).toBe("1 left");
    expect(leftLabel(100, true)).toBe("100+ left");
  });
});

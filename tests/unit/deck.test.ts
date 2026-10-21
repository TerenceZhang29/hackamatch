import { describe, expect, it } from "vitest";
import {
  deckHref,
  defaultDeckKind,
  leftLabel,
  parseDeckKind,
  parsePassToken,
  passToken,
} from "@/lib/deck";

describe("deckHref", () => {
  it("is / or narrowed to an event", () => {
    expect(deckHref(null)).toBe("/");
    expect(deckHref("cornell-tech-fall-hack")).toBe("/?event=cornell-tech-fall-hack");
  });

  it("names the deck when given (P1-23)", () => {
    expect(deckHref(null, "builders")).toBe("/?deck=builders");
    expect(deckHref("fall-hack", "ideas")).toBe("/?deck=ideas&event=fall-hack");
  });
});

describe("the two decks", () => {
  it("idea people start on Builders; builders and 'both' on Ideas", () => {
    expect(defaultDeckKind("idea")).toBe("builders");
    expect(defaultDeckKind("builder")).toBe("ideas");
    expect(defaultDeckKind("both")).toBe("ideas");
    expect(defaultDeckKind(null)).toBe("ideas");
  });

  it("reads ?deck= and ignores anything else", () => {
    expect(parseDeckKind("ideas")).toBe("ideas");
    expect(parseDeckKind("builders")).toBe("builders");
    expect(parseDeckKind("list")).toBeNull();
    expect(parseDeckKind(["ideas"])).toBeNull();
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

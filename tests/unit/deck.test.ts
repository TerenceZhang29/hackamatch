import { describe, expect, it } from "vitest";
import { deckHref, interleave, leftLabel } from "@/lib/deck";

describe("interleave", () => {
  it("alternates, starting with the first list, then appends the rest", () => {
    expect(interleave([1, 2, 3], ["a"])).toEqual([1, "a", 2, 3]);
    expect(interleave([1], ["a", "b", "c"])).toEqual([1, "a", "b", "c"]);
    expect(interleave([], ["a"])).toEqual(["a"]);
    expect(interleave([], [])).toEqual([]);
  });
});

describe("deckHref", () => {
  it("is / or narrowed to an event", () => {
    expect(deckHref(null)).toBe("/");
    expect(deckHref("cornell-tech-fall-hack")).toBe("/?event=cornell-tech-fall-hack");
  });
});

describe("leftLabel", () => {
  it("shows a + when there are more than it looked ahead", () => {
    expect(leftLabel(1, false)).toBe("1 left");
    expect(leftLabel(100, true)).toBe("100+ left");
  });
});

import { describe, expect, it } from "vitest";
import { parseNetIds } from "@/lib/pilot";

describe("parseNetIds", () => {
  it("reads netIDs and Cornell addresses in any separator, lowercased and deduplicated", () => {
    expect(parseNetIds("ut-1, UT-2\nut-3@cornell.edu;  ut-1 ut-4")).toEqual({
      netIds: ["ut-1", "ut-2", "ut-3", "ut-4"],
      invalid: [],
    });
  });

  it("reports entries it can't read, including other domains", () => {
    expect(parseNetIds("ut-5 someone@gmail.com a bad!id ut-6@ut-7@cornell.edu")).toEqual({
      netIds: ["ut-5"],
      invalid: ["someone@gmail.com", "a", "bad!id", "ut-6@ut-7@cornell.edu"],
    });
  });

  it("returns nothing for blank input", () => {
    expect(parseNetIds("  \n ,, ")).toEqual({ netIds: [], invalid: [] });
  });
});

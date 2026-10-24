import { describe, expect, it } from "vitest";
import { dateTile, nearestPoolEvents, shortDate, topSkills } from "@/lib/person-card";

describe("topSkills", () => {
  it("takes stack then skills, without repeats", () => {
    expect(topSkills({ stack: ["react", "go"], skills: ["frontend", "react", "ml"] })).toEqual([
      "react",
      "go",
      "frontend",
    ]);
    expect(topSkills({ stack: [], skills: ["ml"] })).toEqual(["ml"]);
  });
});

describe("nearestPoolEvents", () => {
  it("keeps the soonest three", () => {
    const events = [
      { id: "c", name: "C", startDate: "2026-12-14" },
      { id: "a", name: "A", startDate: "2026-11-09" },
      { id: "d", name: "D", startDate: "2027-01-20" },
      { id: "b", name: "B", startDate: "2026-11-20" },
    ];
    expect(nearestPoolEvents(events).map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(nearestPoolEvents([])).toEqual([]);
  });
});

describe("shortDate", () => {
  it("reads the date as written, in any time zone", () => {
    expect(shortDate("2026-11-09")).toBe("Nov 9");
    expect(shortDate("2027-01-01")).toBe("Jan 1");
  });
});

describe("dateTile", () => {
  it("is the month and day of the start date, in any time zone", () => {
    expect(dateTile("2026-11-09")).toEqual({ month: "NOV", day: "9" });
  });
});

import { describe, expect, it } from "vitest";
import { lookingFor, nearestPoolEvents, roleTags, shortDate, topSkills } from "@/lib/person-card";

describe("roleTags", () => {
  it("is Builds, Ideas or both", () => {
    expect(roleTags("builder")).toEqual(["build"]);
    expect(roleTags("idea")).toEqual(["idea"]);
    expect(roleTags("both")).toEqual(["build", "idea"]);
  });
});

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

describe("lookingFor", () => {
  it("names what they want, then who", () => {
    expect(lookingFor("idea", ["hackathon"])).toBe("Hackathon partner · a builder");
    expect(lookingFor("builder", ["hackathon", "side_project"])).toBe(
      "Hackathon partner, Project partner · an idea",
    );
    expect(lookingFor("both", ["cofounder"])).toBe("Co-founder · a builder or an idea");
    expect(lookingFor("builder", [])).toBe("an idea");
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

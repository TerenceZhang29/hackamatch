import { describe, expect, it } from "vitest";
import { joinNames, STATUS_LABELS, teamSummary } from "@/lib/my-events";

const people = (...names: string[]) => names.map((firstName) => ({ firstName }));

describe("joinNames", () => {
  it("joins with commas and a final 'and'", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Sofia"])).toBe("Sofia");
    expect(joinNames(["Sofia", "Omar"])).toBe("Sofia and Omar");
    expect(joinNames(["Sofia", "Omar", "Lee"])).toBe("Sofia, Omar and Lee");
  });
});

describe("teamSummary", () => {
  it("names the team, then counts other matches", () => {
    expect(teamSummary({ teams: [{ members: people("Sofia", "Omar") }], matchedNoTeam: [] })).toBe(
      "Team with Sofia and Omar",
    );
    expect(
      teamSummary({ teams: [{ members: people("Sofia") }], matchedNoTeam: people("Lee") }),
    ).toBe("Team with Sofia · 1 more match");
    expect(
      teamSummary({ teams: [{ members: people("Sofia") }], matchedNoTeam: people("Lee", "Ava") }),
    ).toBe("Team with Sofia · 2 more matches");
  });

  it("names someone on two teams once", () => {
    expect(
      teamSummary({
        teams: [{ members: people("Sofia") }, { members: people("Sofia", "Omar") }],
        matchedNoTeam: [],
      }),
    ).toBe("Team with Sofia and Omar");
  });

  it("without a team, describes the matches", () => {
    expect(teamSummary({ teams: [], matchedNoTeam: people("Lee") })).toBe(
      "Matched with Lee, no team yet",
    );
    expect(teamSummary({ teams: [], matchedNoTeam: people("Lee", "Ava", "Bo") })).toBe(
      "3 matches, no team yet",
    );
    expect(teamSummary({ teams: [], matchedNoTeam: [] })).toBe("No matches yet");
  });
});

describe("STATUS_LABELS", () => {
  it("has a label for every status", () => {
    expect(STATUS_LABELS).toEqual({
      looking: "Looking for a team",
      "have-team": "Have my team",
      "not-going": "Not marked as going",
    });
  });
});

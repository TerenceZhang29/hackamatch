import { describe, expect, it } from "vitest";
import { NYC_HACKATHONS, upcomingNycHackathons, type NycHackathon } from "@/lib/nyc-hackathons";

const hack = (name: string, start: string, end = start): NycHackathon => ({
  name,
  start,
  end,
  place: "NYC",
  url: "https://example.com",
});

describe("upcomingNycHackathons", () => {
  it("drops hackathons that have ended and sorts the rest soonest first", () => {
    const list = [
      hack("Later", "2026-11-14"),
      hack("Past", "2026-10-20"),
      hack("Soon", "2026-10-26"),
    ];
    expect(upcomingNycHackathons("2026-10-22", list).map((h) => h.name)).toEqual(["Soon", "Later"]);
  });

  it("keeps a hackathon until its last day", () => {
    const list = [hack("Weekend", "2026-10-24", "2026-10-26")];
    expect(upcomingNycHackathons("2026-10-26", list)).toHaveLength(1);
    expect(upcomingNycHackathons("2026-10-27", list)).toHaveLength(0);
  });

  it("has valid dates and https links", () => {
    for (const h of NYC_HACKATHONS) {
      expect(h.start <= h.end, h.name).toBe(true);
      expect(h.url, h.name).toMatch(/^https:\/\//);
    }
  });
});

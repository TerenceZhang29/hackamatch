import { describe, expect, it } from "vitest";
import {
  EMPTY_DETAILS,
  detailsFromRow,
  detailsToRow,
  eventDetailsSchema,
  formatDollars,
  formatJudging,
  formatPrizes,
  formatSchedule,
  formatTracks,
  hasDetails,
  httpsUrl,
  parseDollars,
  parseJudging,
  parsePrizes,
  parseSchedule,
  parseTracks,
  shortDollars,
  toSkillSlugs,
} from "@/lib/event-details";

describe("money", () => {
  it("parses common ways of writing an amount", () => {
    expect(parseDollars("$12,000")).toBe(1_200_000);
    expect(parseDollars("500")).toBe(50_000);
    expect(parseDollars("12k")).toBe(1_200_000);
    expect(parseDollars("$1.5K")).toBe(150_000);
    expect(parseDollars("a laptop")).toBeNull();
  });
  it("formats in full and short", () => {
    expect(formatDollars(500_000)).toBe("$5,000");
    expect(shortDollars(1_200_000)).toBe("$12k");
    expect(shortDollars(150_000)).toBe("$1.5k");
    expect(shortDollars(50_000)).toBe("$500");
  });
});

describe("httpsUrl", () => {
  it("keeps https links only", () => {
    expect(httpsUrl("https://example.com/hack")).toBe("https://example.com/hack");
    expect(httpsUrl("http://example.com")).toBeNull();
    expect(httpsUrl("javascript:alert(1)")).toBeNull();
    expect(httpsUrl("not a url")).toBeNull();
    expect(httpsUrl(null)).toBeNull();
  });
});

describe("skills", () => {
  it("maps slugs, aliases and display labels; drops unknown ones", () => {
    expect(toSkillSlugs(["ml", "Backend", "React", "underwater basket weaving", "ml"])).toEqual([
      "ml",
      "backend",
      "react",
    ]);
  });
});

describe("one item per line", () => {
  it("round-trips prizes", () => {
    const prizes = parsePrizes("1st place | $5,000\n\n2nd place | 3000 | plus mentorship\nSwag");
    expect(prizes).toEqual([
      { label: "1st place", amountCents: 500_000, note: null },
      { label: "2nd place", amountCents: 300_000, note: "plus mentorship" },
      { label: "Swag", amountCents: null, note: null },
    ]);
    expect(formatPrizes(prizes)).toBe(
      "1st place | $5,000\n2nd place | $3,000 | plus mentorship\nSwag",
    );
  });

  it("round-trips tracks, with skills by name", () => {
    const tracks = parseTracks(
      "Less paperwork | Draft clinical notes | ML, Backend, nonsense\nOpen data",
    );
    expect(tracks).toEqual([
      { name: "Less paperwork", description: "Draft clinical notes", skills: ["ml", "backend"] },
      { name: "Open data", description: null, skills: [] },
    ]);
    expect(parseTracks(formatTracks(tracks))).toEqual(tracks);
  });

  it("round-trips judging", () => {
    const judging = parseJudging("Impact | 30%\nDemo | 30\nDesign");
    expect(judging).toEqual([
      { criterion: "Impact", weightPct: 30 },
      { criterion: "Demo", weightPct: 30 },
      { criterion: "Design", weightPct: null },
    ]);
    expect(formatJudging(judging)).toBe("Impact | 30%\nDemo | 30%\nDesign");
  });

  it("round-trips the schedule, with or without a date", () => {
    const schedule = parseSchedule("2026-12-05 | 10:00 AM | Check-in\n1:00 PM | Winners\nParty");
    expect(schedule).toEqual([
      { date: "2026-12-05", time: "10:00 AM", label: "Check-in" },
      { date: null, time: "1:00 PM", label: "Winners" },
      { date: null, time: null, label: "Party" },
    ]);
    expect(parseSchedule(formatSchedule(schedule))).toEqual(schedule);
  });
});

describe("eventDetailsSchema", () => {
  it("accepts the empty details", () => {
    expect(eventDetailsSchema.parse(EMPTY_DETAILS)).toEqual(EMPTY_DETAILS);
    expect(hasDetails(EMPTY_DETAILS)).toBe(false);
  });

  it("drops bad links and unknown skills, and enforces limits", () => {
    const parsed = eventDetailsSchema.parse({
      ...EMPTY_DETAILS,
      applyUrl: "http://insecure.example",
      chatUrl: "https://discord.gg/abc",
      tracks: [{ name: "Track", description: null, skills: ["ML", "made up"] }],
      perks: ["meals", "meals"],
    });
    expect(parsed.applyUrl).toBeNull();
    expect(parsed.chatUrl).toBe("https://discord.gg/abc");
    expect(parsed.tracks[0]!.skills).toEqual(["ml"]);
    expect(parsed.perks).toEqual(["meals"]);
    expect(hasDetails(parsed)).toBe(true);

    const tooMany = {
      ...EMPTY_DETAILS,
      tracks: Array(9).fill({ name: "T", description: null, skills: [] }),
    };
    expect(eventDetailsSchema.safeParse(tooMany).success).toBe(false);
    expect(eventDetailsSchema.safeParse({ ...EMPTY_DETAILS, perks: ["spa"] }).success).toBe(false);
  });
});

describe("rows", () => {
  it("round-trips through the events columns; empty lists are stored as null", () => {
    const details = {
      ...EMPTY_DETAILS,
      format: "in_person" as const,
      prizes: [{ label: "1st", amountCents: 100, note: null }],
    };
    const row = detailsToRow(details);
    expect(row.tracks).toBeNull();
    expect(detailsFromRow(row)).toEqual(details);
  });

  it("reads a malformed list as empty", () => {
    const row = { ...detailsToRow(EMPTY_DETAILS), prizes: [{ nope: true }], format: "space" };
    expect(detailsFromRow(row).prizes).toEqual([]);
    expect(detailsFromRow(row).format).toBeNull();
  });
});

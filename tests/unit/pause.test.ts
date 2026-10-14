import { describe, expect, it } from "vitest";
import { describePause, isPaused, PAUSE_INDEFINITELY, pausedUntilFor } from "@/lib/pause";

const now = new Date("2026-10-14T12:00:00Z");

describe("pausedUntilFor", () => {
  it("adds a week or a month", () => {
    expect(pausedUntilFor("week", now)).toBe("2026-10-21T12:00:00.000Z");
    expect(pausedUntilFor("month", now)).toBe("2026-11-13T12:00:00.000Z");
  });

  it("uses a far-future date for an open-ended pause, and null to resume", () => {
    expect(pausedUntilFor("indefinite", now)).toBe(PAUSE_INDEFINITELY);
    expect(pausedUntilFor("resume", now)).toBeNull();
  });
});

describe("isPaused", () => {
  it("is true only while the pause lasts", () => {
    expect(isPaused(null, now)).toBe(false);
    expect(isPaused("2026-10-13T00:00:00Z", now)).toBe(false);
    expect(isPaused("2026-10-21T00:00:00Z", now)).toBe(true);
    expect(isPaused(PAUSE_INDEFINITELY, now)).toBe(true);
  });
});

describe("describePause", () => {
  it("names the end date in the app's time zone, or says it is open-ended", () => {
    // 02:00 UTC on the 22nd is still the 21st in New York.
    expect(describePause("2026-10-22T02:00:00Z", "America/New_York")).toBe("Paused until Oct 21");
    expect(describePause(PAUSE_INDEFINITELY, "America/New_York")).toBe(
      "Paused until you turn matches back on",
    );
  });
});

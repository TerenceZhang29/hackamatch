/** Pausing matches: a user stays signed up but leaves the pool until `paused_until`. */

/** "Until I turn it back on" is stored as a date far in the future. */
export const PAUSE_INDEFINITELY = "9999-12-31T00:00:00.000Z";

export const PAUSE_CHOICES = ["week", "month", "indefinite", "resume"] as const;
export type PauseChoice = (typeof PAUSE_CHOICES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** The `paused_until` value for a choice, or null to resume. */
export function pausedUntilFor(choice: PauseChoice, now: Date = new Date()): string | null {
  switch (choice) {
    case "week":
      return new Date(now.getTime() + 7 * DAY_MS).toISOString();
    case "month":
      return new Date(now.getTime() + 30 * DAY_MS).toISOString();
    case "indefinite":
      return PAUSE_INDEFINITELY;
    case "resume":
      return null;
  }
}

/** Whether a user is paused right now. */
export function isPaused(pausedUntil: string | null, now: Date = new Date()): boolean {
  return pausedUntil !== null && new Date(pausedUntil).getTime() > now.getTime();
}

/** How a pause reads to the user: "Paused until Oct 21" or "Paused until you resume". */
export function describePause(pausedUntil: string, timeZone: string): string {
  if (new Date(pausedUntil).getUTCFullYear() >= 9999)
    return "Paused until you turn matches back on";
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(pausedUntil));
  return `Paused until ${date}`;
}

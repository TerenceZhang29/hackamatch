/** What a person card says, as pure functions (docs/design.md, person cards; P1-24). */

/** Their first few build skills: stack first, then skills, without repeats. */
export function topSkills(person: { stack: readonly string[]; skills: readonly string[] }, n = 3) {
  return [...new Set([...person.stack, ...person.skills])].slice(0, n);
}

export interface PoolEvent {
  id: string;
  name: string;
  /** ISO date, "2026-11-09". */
  startDate: string;
}

/** The nearest `n` hackathons someone is going to and still looking for teammates at. */
export function nearestPoolEvents<T extends PoolEvent>(events: readonly T[], n = 3): T[] {
  return [...events].sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, n);
}

function utcDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

/** "Nov 9" from "2026-11-09", without time zone shifts. */
export function shortDate(isoDate: string): string {
  return utcDate(isoDate).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "NOV" and "9" from "2026-11-09", for a calendar tile. */
export function dateTile(isoDate: string): { month: string; day: string } {
  const date = utcDate(isoDate);
  return {
    month: date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(),
    day: String(date.getUTCDate()),
  };
}

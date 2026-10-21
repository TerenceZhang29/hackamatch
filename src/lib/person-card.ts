/** What a person card says, as pure functions (docs/design.md, person cards). */

export type Role = "idea" | "builder" | "both";
export type Intent = "hackathon" | "side_project" | "cofounder";

/** The role as tags: Builds and/or Ideas. */
export function roleTags(role: Role): ("build" | "idea")[] {
  return role === "both" ? ["build", "idea"] : role === "builder" ? ["build"] : ["idea"];
}

export const ROLE_TAG_LABELS = { build: "Builds", idea: "Ideas" } as const;

/** Their first few build skills: stack first, then skills, without repeats. */
export function topSkills(person: { stack: readonly string[]; skills: readonly string[] }, n = 3) {
  return [...new Set([...person.stack, ...person.skills])].slice(0, n);
}

const INTENT_LABELS: Record<Intent, string> = {
  hackathon: "Hackathon partner",
  side_project: "Project partner",
  cofounder: "Co-founder",
};

/** Who they want: idea people want builders, builders want ideas. */
const SEEKING: Record<Role, string> = {
  idea: "a builder",
  builder: "an idea",
  both: "a builder or an idea",
};

/** "Hackathon partner, Project partner · a builder". */
export function lookingFor(role: Role, intents: readonly Intent[]): string {
  const kinds = intents.map((intent) => INTENT_LABELS[intent]).join(", ");
  return kinds ? `${kinds} · ${SEEKING[role]}` : SEEKING[role];
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

/** "Nov 9" from "2026-11-09", without time zone shifts. */
export function shortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The hackathons on an idea card (P1-23): the event the idea is tagged with
 * first, then its owner's nearest ones where they're still looking, up to `n`.
 */
export function ideaHackathons<T extends PoolEvent>(
  ideaEvent: T | null,
  ownerEvents: readonly T[],
  n = 3,
): T[] {
  const rest = nearestPoolEvents(
    ownerEvents.filter((event) => event.id !== ideaEvent?.id),
    n,
  );
  return (ideaEvent ? [ideaEvent, ...rest] : rest).slice(0, n);
}

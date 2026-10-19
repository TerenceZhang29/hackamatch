/** Wording for "Your hackathons" on /matches. Pure, so it can be unit tested. */

/** "Sofia", "Sofia and Omar", "Sofia, Omar and Lee". */
export function joinNames(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export const STATUS_LABELS = {
  looking: "Looking for a team",
  "have-team": "Have my team",
  "not-going": "Not marked as going",
} as const;

/** The team part of an event's one-line summary. */
export function teamSummary(event: {
  teams: { members: { firstName: string }[] }[];
  matchedNoTeam: { firstName: string }[];
}): string {
  const teamNames = [...new Set(event.teams.flatMap((t) => t.members.map((m) => m.firstName)))];
  const others = event.matchedNoTeam.length;
  if (teamNames.length) {
    const more = others === 0 ? "" : others === 1 ? " · 1 more match" : ` · ${others} more matches`;
    return `Team with ${joinNames(teamNames)}${more}`;
  }
  if (others === 1) return `Matched with ${event.matchedNoTeam[0]!.firstName}, no team yet`;
  if (others > 1) return `${others} matches, no team yet`;
  return "No matches yet";
}

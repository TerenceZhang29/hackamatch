/** Pure helpers for the one-card deck (docs/plans/card-deck.md). */

/** The deck's URL, optionally narrowed to one event's pool (P1-24: one deck, people only). */
export function deckHref(eventSlug: string | null): string {
  return eventSlug ? `/?${new URLSearchParams({ event: eventSlug })}` : "/";
}

/**
 * The `passed=` value a Pass leaves in the URL for Undo: `idea:<id>` or
 * `person:<id>` (P1-23). A bare id is a match from before per-card passes.
 */
export function passToken(kind: "idea" | "person", targetId: string): string {
  return `${kind}:${targetId}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePassToken(
  token: unknown,
): { kind: "idea" | "person"; targetId: string } | { matchId: string } | null {
  if (typeof token !== "string") return null;
  const [kind, id] = token.split(":");
  if ((kind === "idea" || kind === "person") && id && UUID.test(id)) {
    return { kind, targetId: id };
  }
  return UUID.test(token) ? { matchId: token } : null;
}

/** "1 left", "24 left", "100+ left". */
export function leftLabel(count: number, more: boolean): string {
  return more ? `${count}+ left` : `${count} left`;
}

/**
 * What the viewer and a card have in common: shared tags (skills, stack and
 * areas, in the card's order) and shared events. Plain tag matching, no AI.
 */
export function inCommon(
  viewer: { tags: readonly string[]; eventIds: readonly string[] },
  card: { tags: readonly string[]; eventIds: readonly string[] },
): { tags: string[]; eventIds: string[] } {
  const mine = new Set(viewer.tags);
  const myEvents = new Set(viewer.eventIds);
  return {
    tags: [...new Set(card.tags)].filter((tag) => mine.has(tag)),
    eventIds: [...new Set(card.eventIds)].filter((id) => myEvents.has(id)),
  };
}

/**
 * The hackathon filter above the deck (P1-24): the selected event first, then
 * the viewer's own, then the rest, each group soonest first as given.
 */
export function orderFilterEvents<T extends { slug: string; id: string }>(
  upcoming: readonly T[],
  myEventIds: readonly string[],
  selected: string | null,
): T[] {
  const mine = new Set(myEventIds);
  const rank = (event: T) => (event.slug === selected ? 0 : mine.has(event.id) ? 1 : 2);
  return [...upcoming].sort((a, b) => rank(a) - rank(b));
}

/** A person's hackathons with the ones the viewer shares first (P1-24), each group soonest first. */
export function sharedFirst<T extends { id: string; startDate: string }>(
  events: readonly T[],
  viewerEventIds: readonly string[],
): (T & { shared: boolean })[] {
  const mine = new Set(viewerEventIds);
  return [...events]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((event) => ({ ...event, shared: mine.has(event.id) }))
    .sort((a, b) => Number(b.shared) - Number(a.shared));
}

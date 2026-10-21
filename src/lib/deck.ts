/** Pure helpers for the one-card deck (docs/plans/card-deck.md). */

/** The two decks (P1-23): swipe through ideas, or through builders. */
export type DeckKind = "ideas" | "builders";

export function parseDeckKind(value: unknown): DeckKind | null {
  return value === "ideas" || value === "builders" ? value : null;
}

/** Idea people start on Builders; builders and "both" start on Ideas. */
export function defaultDeckKind(role: "idea" | "builder" | "both" | null): DeckKind {
  return role === "idea" ? "builders" : "ideas";
}

/** The deck's URL: which deck (`?deck=`), optionally narrowed to one event's pool. */
export function deckHref(eventSlug: string | null, kind: DeckKind | null = null): string {
  const params = new URLSearchParams();
  if (kind) params.set("deck", kind);
  if (eventSlug) params.set("event", eventSlug);
  const query = params.toString();
  return query ? `/?${query}` : "/";
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

export const INTENT_LABELS = {
  hackathon: "Hackathon partner",
  side_project: "Side project",
  cofounder: "Co-founder",
} as const;

export const EXPERIENCE_LABELS = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
} as const;

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

/** An idea's needed skills, each marked when the viewer has it. */
export function markNeeds(
  needs: readonly string[],
  viewerTags: readonly string[],
): { tag: string; have: boolean }[] {
  const mine = new Set(viewerTags);
  return needs.map((tag) => ({ tag, have: mine.has(tag) }));
}

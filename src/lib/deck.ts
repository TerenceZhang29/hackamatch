/** Pure helpers for the one-card deck (docs/plans/card-deck.md). */

/** Alternates two lists, starting with `a`, then appends whatever is left. */
export function interleave<A, B>(a: readonly A[], b: readonly B[]): (A | B)[] {
  const out: (A | B)[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]!);
    if (i < b.length) out.push(b[i]!);
  }
  return out;
}

/** The deck's URL, optionally narrowed to one event's pool. */
export function deckHref(eventSlug: string | null): string {
  return eventSlug ? `/?${new URLSearchParams({ event: eventSlug })}` : "/";
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

import "server-only";
import { getConfig } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";
import { localDateString } from "@/lib/time";
import { parsePassToken } from "@/lib/deck";
import { listBoardPeople, type BoardPerson } from "./board";
import { passedCards, removeCardPass } from "./card-passes";
import { undoPass } from "./matches";

/** How many cards to look ahead; also the most the "N left" count shows before "+". */
export const DECK_LOOKAHEAD = 100;

/**
 * Who the deck leaves out: the viewer, people they've already answered, and
 * revealed matches. Unlike the board, people still waiting on the viewer's
 * answer stay in, so answering their card makes the match.
 */
export async function deckExcludedUserIds(viewerId: string): Promise<string[]> {
  const { data, error } = await createServiceClient()
    .from("matches")
    .select("user_a, user_b, a_response, b_response, revealed_at")
    .or(`user_a.eq.${viewerId},user_b.eq.${viewerId}`);
  if (error) throw new Error(`deckExcludedUserIds: ${error.message}`);
  const answered = data.filter((m) => {
    const mine = m.user_a === viewerId ? m.a_response : m.b_response;
    return m.revealed_at !== null || mine !== "pending";
  });
  return [viewerId, ...answered.map((m) => (m.user_a === viewerId ? m.user_b : m.user_a))];
}

/**
 * The deck (P1-24): one kind of card, people. Everyone in the pool, minus the
 * viewer, people they've answered, revealed matches and cards they passed;
 * optionally only people going to one event.
 *
 * The order is the board's for now (newest first). Phase 2's ranking
 * replaces this function.
 */
export async function nextDeckCards(
  viewer: { id: string },
  eventSlug: string | null,
): Promise<{ cards: BoardPerson[]; more: boolean }> {
  const [exclude, passed] = await Promise.all([
    deckExcludedUserIds(viewer.id),
    passedCards(viewer.id),
  ]);
  const filters = { event: eventSlug, domain: null, skill: null };
  const people = await listBoardPeople(filters, DECK_LOOKAHEAD, [...exclude, ...passed.people]);
  return { cards: people.rows, more: people.hasMore };
}

export interface DeckEvent {
  id: string;
  slug: string;
  name: string;
  startDate: string;
}

export interface DeckDetails {
  /** The viewer's upcoming events, so shared hackathons come first and green. */
  viewerEventIds: string[];
  /** The person's upcoming events where they're still in the pool, soonest first. */
  personEvents: DeckEvent[];
  /** The person is a demo profile. */
  isDemo: boolean;
}

/**
 * The extra details for the deck's next cards: only fields members can
 * already see on event and person pages. Never contact details.
 */
export async function deckDetailsFor(
  viewerId: string,
  userIds: readonly string[],
): Promise<Record<string, DeckDetails>> {
  if (userIds.length === 0) return {};
  const supabase = createServiceClient();
  const today = localDateString(getConfig().APP_TIMEZONE);
  const [viewerEvents, personEvents, demo] = await Promise.all([
    supabase
      .from("event_interests")
      .select("events!inner(id)")
      .eq("user_id", viewerId)
      .gte("events.end_date", today),
    supabase
      .from("event_interests")
      .select("user_id, events!inner(id, slug, name, start_date, end_date)")
      .in("user_id", userIds)
      .is("left_pool_at", null)
      .gte("events.end_date", today),
    supabase.from("users").select("id, is_demo").in("id", userIds),
  ]);
  for (const { error } of [viewerEvents, personEvents, demo]) {
    if (error) throw new Error(`deckDetailsFor: ${error.message}`);
  }
  const viewerEventIds = viewerEvents.data!.map(({ events }) => events.id);
  const isDemo = new Set(demo.data!.filter((u) => u.is_demo).map((u) => u.id));
  const result: Record<string, DeckDetails> = {};
  for (const id of userIds) {
    result[id] = {
      viewerEventIds,
      personEvents: personEvents
        .data!.filter((row) => row.user_id === id)
        .map(({ events }) => ({
          id: events.id,
          slug: events.slug,
          name: events.name,
          startDate: events.start_date,
        }))
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
      isDemo: isDemo.has(id),
    };
  }
  return result;
}

/** The deck's Undo: takes back a Pass (a `passed=` token). False when there was nothing to undo. */
export async function undoDeckPass(userId: string, token: string): Promise<boolean> {
  const pass = parsePassToken(token);
  if (pass && "matchId" in pass) return undoPass(pass.matchId, userId);
  if (pass) return removeCardPass(userId, pass.kind, pass.targetId);
  return false;
}

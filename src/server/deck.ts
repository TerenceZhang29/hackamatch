import "server-only";
import { getConfig } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";
import { localDateString } from "@/lib/time";
import { listBoardPeople, type BoardPerson } from "./board";
import { passedCards } from "./card-passes";

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
 * The extra details for the card on top: only fields members can already see
 * on event and person pages. Never contact details.
 */
export async function deckDetails(viewerId: string, person: BoardPerson): Promise<DeckDetails> {
  const supabase = createServiceClient();
  const today = localDateString(getConfig().APP_TIMEZONE);
  const upcomingEventsOf = async (userId: string, inPoolOnly: boolean) => {
    let request = supabase
      .from("event_interests")
      .select("left_pool_at, events!inner(id, slug, name, start_date, end_date)")
      .eq("user_id", userId)
      .gte("events.end_date", today);
    if (inPoolOnly) request = request.is("left_pool_at", null);
    const { data, error } = await request;
    if (error) throw new Error(`deckDetails: ${error.message}`);
    return data
      .map(({ events }) => ({
        id: events.id,
        slug: events.slug,
        name: events.name,
        startDate: events.start_date,
      }))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  };
  const [viewerEvents, personEvents, demo] = await Promise.all([
    upcomingEventsOf(viewerId, false),
    upcomingEventsOf(person.user_id, true),
    supabase.from("users").select("is_demo").eq("id", person.user_id).maybeSingle(),
  ]);
  return {
    viewerEventIds: viewerEvents.map((e) => e.id),
    personEvents,
    isDemo: demo.data?.is_demo ?? false,
  };
}

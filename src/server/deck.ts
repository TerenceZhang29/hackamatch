import "server-only";
import { getConfig } from "@/lib/config";
import type { DeckKind } from "@/lib/deck";
import { createServiceClient } from "@/lib/supabase/service";
import { localDateString } from "@/lib/time";
import {
  getPublicPerson,
  listBoardIdeas,
  listBoardPeople,
  type BoardIdea,
  type BoardPerson,
} from "./board";
import { passedCards } from "./card-passes";

export type DeckCard = { kind: "idea"; idea: BoardIdea } | { kind: "person"; person: BoardPerson };

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
 * One deck at a time (P1-23): ideas (open ideas from anyone) or builders
 * (people who build, "both" included). Cards the viewer passed stay out of
 * their deck only; passing a person's card still shows their ideas.
 *
 * The order is the board's for now (featured, then newest). Phase 2's ranking
 * replaces this function.
 */
export async function nextDeckCards(
  viewer: { id: string },
  eventSlug: string | null,
  kind: DeckKind,
): Promise<{ cards: DeckCard[]; more: boolean }> {
  const [exclude, passed] = await Promise.all([
    deckExcludedUserIds(viewer.id),
    passedCards(viewer.id),
  ]);
  const filters = { event: eventSlug, domain: null, skill: null, intent: null };
  if (kind === "ideas") {
    const ideas = await listBoardIdeas(filters, DECK_LOOKAHEAD, exclude, passed.ideas);
    return {
      cards: ideas.rows.map((idea): DeckCard => ({ kind: "idea", idea })),
      more: ideas.hasMore,
    };
  }
  const people = await listBoardPeople(filters, DECK_LOOKAHEAD, [...exclude, ...passed.people]);
  return {
    cards: people.rows.map((person): DeckCard => ({ kind: "person", person })),
    more: people.hasMore,
  };
}

export interface DeckEvent {
  id: string;
  slug: string;
  name: string;
  startDate: string;
}

export interface DeckDetails {
  /** The viewer's tags and upcoming events, for "You both" and highlighted needs. */
  viewer: { tags: string[]; eventIds: string[] };
  /**
   * The person on the card, or the idea's owner: upcoming events they're in
   * the pool for, and their open ideas' pitches (person cards show the count).
   */
  personEvents: DeckEvent[];
  personIdeas: string[];
  /** Idea card: the owner's public card (null if they're not in the pool). */
  owner: BoardPerson | null;
  /** Idea card: the event the idea is tagged with, if it hasn't ended. */
  ideaEvent: DeckEvent | null;
  /** The person, or the idea's owner, is a demo profile. */
  isDemo: boolean;
}

/**
 * The extra details for the card on top: only fields members can already see
 * on the board, event pages and person pages. Never contact details or an
 * idea's full text.
 */
export async function deckDetails(viewerId: string, card: DeckCard): Promise<DeckDetails> {
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

  const ownerId = card.kind === "idea" ? card.idea.owner_id : null;
  // Idea cards show the owner's hackathons; person cards the person's.
  const personId = card.kind === "person" ? card.person.user_id : ownerId;
  const ideaEventId = card.kind === "idea" ? card.idea.event_id : null;
  const [profile, viewerEvents, personEvents, personIdeas, owner, ideaEvent] = await Promise.all([
    supabase
      .from("profiles")
      .select("skills, stack, domains")
      .eq("user_id", viewerId)
      .maybeSingle(),
    upcomingEventsOf(viewerId, false),
    personId ? upcomingEventsOf(personId, true) : Promise.resolve([]),
    personId
      ? supabase
          .from("ideas")
          .select("pitch")
          .eq("owner_id", personId)
          .eq("status", "open")
          .not("pitch", "is", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { pitch: string | null }[], error: null }),
    ownerId ? getPublicPerson(ownerId) : Promise.resolve(null),
    ideaEventId
      ? supabase
          .from("events")
          .select("id, slug, name, start_date")
          .eq("id", ideaEventId)
          .gte("end_date", today)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (ideaEvent.error) throw new Error(`deckDetails: ${ideaEvent.error.message}`);
  if (profile.error) throw new Error(`deckDetails: ${profile.error.message}`);
  if (personIdeas.error) throw new Error(`deckDetails: ${personIdeas.error.message}`);
  const p = profile.data;
  const subject = personId;
  const { data: demo } = subject
    ? await supabase.from("users").select("is_demo").eq("id", subject).maybeSingle()
    : { data: null };
  return {
    viewer: {
      tags: [...(p?.skills ?? []), ...(p?.stack ?? []), ...(p?.domains ?? [])],
      eventIds: viewerEvents.map((e) => e.id),
    },
    personEvents,
    personIdeas: personIdeas.data.map((i) => i.pitch!).filter(Boolean),
    owner,
    ideaEvent: ideaEvent.data
      ? {
          id: ideaEvent.data.id,
          slug: ideaEvent.data.slug,
          name: ideaEvent.data.name,
          startDate: ideaEvent.data.start_date,
        }
      : null,
    isDemo: demo?.is_demo ?? false,
  };
}

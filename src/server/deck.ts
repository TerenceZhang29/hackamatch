import "server-only";
import { getConfig } from "@/lib/config";
import { interleave } from "@/lib/deck";
import { createServiceClient } from "@/lib/supabase/service";
import { localDateString } from "@/lib/time";
import {
  getPublicPerson,
  listBoardIdeas,
  listBoardPeople,
  type BoardIdea,
  type BoardPerson,
} from "./board";
import { getPublicIdea } from "./ideas";

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
 * The viewer's deck, in order: builders see ideas, idea people see builders,
 * and people who do both see the two alternating.
 *
 * The order is the board's for now (featured, then newest). Phase 2's ranking
 * replaces this function.
 */
export async function nextDeckCards(
  viewer: { id: string; role: "idea" | "builder" | "both" | null },
  eventSlug: string | null,
): Promise<{ cards: DeckCard[]; more: boolean }> {
  const exclude = await deckExcludedUserIds(viewer.id);
  const filters = { event: eventSlug, domain: null, skill: null, intent: null };
  const wantIdeas = viewer.role !== "idea";
  const wantPeople = viewer.role !== "builder";
  const [ideas, people] = await Promise.all([
    wantIdeas ? listBoardIdeas(filters, DECK_LOOKAHEAD, exclude) : null,
    wantPeople ? listBoardPeople(filters, DECK_LOOKAHEAD, exclude) : null,
  ]);
  const ideaCards = (ideas?.rows ?? []).map((idea): DeckCard => ({ kind: "idea", idea }));
  const personCards = (people?.rows ?? []).map((person): DeckCard => ({ kind: "person", person }));
  const cards = interleave(ideaCards, personCards).slice(0, DECK_LOOKAHEAD);
  const more =
    Boolean(ideas?.hasMore || people?.hasMore) ||
    ideaCards.length + personCards.length > DECK_LOOKAHEAD;
  return { cards, more };
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
  /** Person card: upcoming events they're in the pool for, and their open ideas' pitches. */
  personEvents: DeckEvent[];
  personIdeas: string[];
  /** Idea card: the owner's public card (null if they're not in the pool). */
  owner: BoardPerson | null;
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

  const ownerId =
    card.kind === "idea" ? ((await getPublicIdea(card.idea.id))?.owner_id ?? null) : null;
  const personId = card.kind === "person" ? card.person.user_id : null;
  const [profile, viewerEvents, personEvents, personIdeas, owner] = await Promise.all([
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
  ]);
  if (profile.error) throw new Error(`deckDetails: ${profile.error.message}`);
  if (personIdeas.error) throw new Error(`deckDetails: ${personIdeas.error.message}`);
  const p = profile.data;
  const subject = personId ?? ownerId;
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
    isDemo: demo?.is_demo ?? false,
  };
}

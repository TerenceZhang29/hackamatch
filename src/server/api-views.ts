import "server-only";
import type {
  ApiDeck,
  ApiEvent,
  ApiEvents,
  ApiMatches,
  ApiMe,
  ApiPair,
  ApiPerson,
  ApiPersonPage,
  ApiTag,
  ApiTaxonomy,
} from "@/lib/api/schemas";
import { getConfig } from "@/lib/config";
import { orderFilterEvents, sharedFirst } from "@/lib/deck";
import { displayName, splitName } from "@/lib/display-name";
import {
  ADMISSION_LABELS,
  detailsFromRow,
  FORMAT_LABELS,
  LEVEL_LABELS,
  PERK_LABELS,
} from "@/lib/event-details";
import { STATUS_LABELS, teamSummary } from "@/lib/my-events";
import { describePause, isPaused } from "@/lib/pause";
import { FEATURED_AREAS, FEATURED_SKILLS, MAX_AREAS, MAX_SKILLS } from "@/lib/signup";
import { createServiceClient } from "@/lib/supabase/service";
import { displayLabel } from "@/lib/taxonomy/labels";
import { RELATED_DOMAINS, skillGroup, slugsOf } from "@/lib/taxonomy/skills";
import { localDateString } from "@/lib/time";
import { demoUserIds, getPublicPerson, listBoardPeople, type BoardPerson } from "./board";
import { deckDetailsFor, nextDeckCards, type DeckDetails } from "./deck";
import {
  countEventInterest,
  eventGoingStats,
  eventTopSkills,
  getEventBySlug,
  getEventPool,
  hasEnded,
  listEventInterestIds,
  listMyEvents,
  listUpcomingEventItems,
  listUpcomingEvents,
} from "./events";
import { countWaiting, getPairMatch, listMatchesForUser, sideOf } from "./matches";
import { getOwnProfile } from "./profiles";
import { getPairPage } from "./teams";

/**
 * What the `/api/v1` routes send the iOS app (docs/plans/ios-app.md), built
 * from the same services the web pages use and shaped to
 * `src/lib/api/schemas.ts`. Service client: every route authorizes the caller
 * first, and each builder returns only what that caller may see on the web.
 */

/** How many cards one `/deck` response holds; the app asks again when they run out. */
export const API_DECK_PAGE = 30;

const tag = (slug: string): ApiTag => ({ slug, label: displayLabel(slug) });
const tags = (slugs: readonly string[]): ApiTag[] => [...new Set(slugs)].map(tag);

// Me ------------------------------------------------------------------------

/** The caller's own profile. Read fresh, so it reflects a change made in the same request. */
export async function meView(userId: string): Promise<ApiMe> {
  const supabase = createServiceClient();
  const [{ data: user, error }, profile, eventIds, waitingCount] = await Promise.all([
    supabase
      .from("users")
      .select("id, cornell_email, name, onboarded_at, paused_until")
      .eq("id", userId)
      .single(),
    getOwnProfile(userId),
    listEventInterestIds(userId),
    countWaiting(userId),
  ]);
  if (error) throw new Error(`meView: ${error.message}`);
  const { firstName, lastName } = splitName(user.name);
  return {
    id: user.id,
    email: user.cornell_email,
    firstName,
    lastName,
    displayName: displayName(user.name),
    onboarded: user.onboarded_at !== null,
    summary: profile.summary || null,
    areas: tags(profile.domains),
    skills: tags([...profile.stack, ...profile.skills]),
    eventIds,
    pause: isPaused(user.paused_until)
      ? {
          until: user.paused_until!,
          label: describePause(user.paused_until!, getConfig().APP_TIMEZONE),
        }
      : null,
    waitingCount,
  };
}

// Taxonomy ------------------------------------------------------------------

/** The areas and skills sign-up and the profile pick from. The same for everyone. */
export function taxonomyView(): ApiTaxonomy {
  const featuredAreas = new Set<string>(FEATURED_AREAS);
  const featuredSkills = new Set<string>([
    ...FEATURED_SKILLS.technical,
    ...FEATURED_SKILLS.business,
  ]);
  return {
    areas: slugsOf("domains").map((slug) => ({
      slug,
      label: displayLabel(slug),
      featured: featuredAreas.has(slug),
      related: [...(RELATED_DOMAINS[slug] ?? [])],
    })),
    skills: [...slugsOf("skills"), ...slugsOf("stack")].map((slug) => ({
      slug,
      label: displayLabel(slug),
      group: skillGroup(slug),
      featured: featuredSkills.has(slug),
    })),
    maxAreas: MAX_AREAS,
    maxSkills: MAX_SKILLS,
  };
}

// People and the deck -------------------------------------------------------

function personView(person: BoardPerson, details: DeckDetails | undefined): ApiPerson {
  return {
    id: person.user_id,
    displayName: person.display_name,
    summary: person.summary || null,
    areas: tags(person.domains),
    skills: tags([...person.stack, ...person.skills]),
    goingTo: sharedFirst(details?.personEvents ?? [], details?.viewerEventIds ?? []),
    isDemo: details?.isDemo ?? false,
  };
}

/** Discover: the next cards, optionally for one event, and the hackathon chips above them. */
export async function deckView(viewerId: string, eventSlug: string | null): Promise<ApiDeck> {
  const [deck, myEventIds, events] = await Promise.all([
    nextDeckCards({ id: viewerId }, eventSlug),
    listEventInterestIds(viewerId),
    listUpcomingEvents(),
  ]);
  const cards = deck.cards.slice(0, API_DECK_PAGE);
  const details = await deckDetailsFor(
    viewerId,
    cards.map((card) => card.user_id),
  );
  const mine = new Set(myEventIds);
  return {
    cards: cards.map((card) => personView(card, details[card.user_id])),
    more: deck.more || deck.cards.length > cards.length,
    event: eventSlug,
    filterEvents: orderFilterEvents(events, myEventIds, eventSlug).map((event) => ({
      id: event.id,
      slug: event.slug,
      name: event.name,
      startDate: event.start_date,
      going: mine.has(event.id),
    })),
  };
}

/** One person's card and where the viewer stands with them; null when they're not in the pool. */
export async function personPageView(
  viewerId: string,
  personId: string,
): Promise<ApiPersonPage | null> {
  if (viewerId === personId) return null;
  const person = await getPublicPerson(personId);
  if (!person) return null;
  const [details, match] = await Promise.all([
    deckDetailsFor(viewerId, [personId]),
    getPairMatch(viewerId, personId),
  ]);
  // The other person's answer is never part of this before a reveal.
  const mine = match
    ? sideOf(match, viewerId) === "a"
      ? match.a_response
      : match.b_response
    : null;
  const status = !match
    ? "none"
    : match.revealed_at
      ? "matched"
      : mine === "pending"
        ? "waiting"
        : mine === "interested"
          ? "sent"
          : "passed";
  return {
    person: personView(person, details[personId]),
    status,
    matchId: match?.revealed_at ? match.id : null,
  };
}

// Events --------------------------------------------------------------------

/** Upcoming hackathons, soonest first. `memberId` adds what only members see. */
export async function eventsView(memberId: string | null): Promise<ApiEvents> {
  const [events, interests] = await Promise.all([
    listUpcomingEventItems(),
    memberId ? listEventInterestIds(memberId) : Promise.resolve([]),
  ]);
  const stats = await eventGoingStats(events.map((event) => event.id));
  const today = localDateString(getConfig().APP_TIMEZONE);
  const going = new Set(interests);
  return {
    events: events.map((event) => ({
      id: event.id,
      slug: event.slug,
      name: event.name,
      startDate: event.start_date,
      endDate: event.end_date,
      venue: event.venue,
      format: event.format,
      formatLabel: event.format ? FORMAT_LABELS[event.format] : null,
      lengthHours: event.length_hours,
      entryFeeCents: event.entry_fee_cents,
      level: event.level,
      levelLabel: event.level ? LEVEL_LABELS[event.level] : null,
      prizeTotalCents: event.prize_total_cents,
      applyBy: event.apply_by !== null && event.apply_by >= today ? event.apply_by : null,
      going: going.has(event.id),
      goingCount: stats.get(event.id)?.going ?? 0,
      // How many still need a team is for members, as on the web.
      needTeamCount: memberId ? (stats.get(event.id)?.needTeam ?? 0) : null,
    })),
  };
}

/** One event's page. `memberId` adds tracks, who's going and the member's own place in the pool. */
export async function eventView(memberId: string | null, slug: string): Promise<ApiEvent | null> {
  const event = await getEventBySlug(slug);
  if (!event) return null;
  const ended = hasEnded(event);
  const [goingCount, pool, faces, stats] = await Promise.all([
    countEventInterest(event.id),
    memberId ? getEventPool(memberId, event.id) : Promise.resolve(null),
    memberId
      ? listBoardPeople({ event: slug, domain: null, skill: null }, 3, [memberId])
      : Promise.resolve(null),
    memberId ? eventGoingStats([event.id]) : Promise.resolve(null),
  ]);
  // Counts only, and only from 5 people, so they can't point at anyone.
  const topSkills = memberId && goingCount >= 5 ? await eventTopSkills(event.id) : [];
  const details = detailsFromRow(event);
  const applyUrl = details.applyUrl ?? event.url;
  const hasTracks = details.tracks.length > 0 || details.tools !== null;
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    description: event.description,
    host: event.host,
    venue: event.venue,
    timeLabel: event.time_label,
    url: event.url,
    startDate: event.start_date,
    endDate: event.end_date,
    ended,
    teamSizeMin: event.team_size_min,
    teamSizeMax: event.team_size_max,
    areas: tags(event.domains),
    format: details.format,
    formatLabel: details.format ? FORMAT_LABELS[details.format] : null,
    lengthHours: details.lengthHours,
    entryFeeCents: details.entryFeeCents,
    openTo: details.openTo,
    level: details.level,
    levelLabel: details.level ? LEVEL_LABELS[details.level] : null,
    admissionLabel: details.admission ? ADMISSION_LABELS[details.admission] : null,
    capacity: details.capacity,
    applyBy: details.applyBy,
    apply:
      applyUrl && !ended
        ? {
            url: applyUrl,
            label: details.applyUrl ? "Apply on the event site" : "Register on the event site",
          }
        : null,
    chatUrl: details.chatUrl,
    prizeTotalCents: details.prizeTotalCents,
    prizes: details.prizes,
    tracksLocked: !memberId && hasTracks,
    tracks: memberId
      ? details.tracks.map((track) => ({
          name: track.name,
          description: track.description,
          skills: tags(track.skills),
        }))
      : [],
    tools: memberId ? details.tools : null,
    judging: details.judging,
    schedule: details.schedule,
    perks: details.perks.map((key) => ({ key, label: PERK_LABELS[key] })),
    perkNotes: details.perkNotes,
    detailsUpdatedAt: event.details_updated_at,
    goingCount,
    needTeamCount: memberId ? (stats?.get(event.id)?.needTeam ?? 0) : null,
    faces: faces?.rows.map((person) => person.display_name) ?? [],
    topSkills: topSkills.map((row) => ({ skill: tag(row.skill), people: row.people })),
    pool,
  };
}

// Matches -------------------------------------------------------------------

/** The Matches tab: every match the member hasn't passed on, and "Your hackathons". */
export async function matchesView(userId: string): Promise<ApiMatches> {
  const [matches, hackathons] = await Promise.all([
    listMatchesForUser(userId),
    listMyEvents(userId),
  ]);
  const demo = await demoUserIds(matches.map((match) => match.otherId));
  return {
    matches: matches.map((match) => ({
      id: match.id,
      section: match.section,
      otherId: match.otherId,
      otherName: match.otherName,
      otherSummary: match.otherSummary || null,
      otherTags: tags(match.otherTags),
      reason: match.reason,
      isNew: match.isNew,
      isDemo: demo.has(match.otherId),
      createdAt: match.createdAt,
    })),
    hackathons: {
      events: hackathons.events.map((event) => ({
        ...event,
        statusLabel: STATUS_LABELS[event.status],
        summary: teamSummary(event),
      })),
      sideProjects: hackathons.sideProjects,
    },
  };
}

/** The pair page of a revealed match the viewer is in; null for anyone else. */
export async function pairView(matchId: string, viewerId: string): Promise<ApiPair | null> {
  const pair = await getPairPage(matchId, viewerId);
  if (!pair) return null;
  const overlapping = pair.events.filter((event) => event.mine && event.theirs);
  const [asks, demo] = await Promise.all([
    // Events both picked count as a match there; ask once per new match whether to keep matching.
    Promise.all(
      overlapping.map(async (event) =>
        (await getEventPool(viewerId, event.id)).askToKeepMatching ? event.id : null,
      ),
    ),
    demoUserIds([pair.other.id]),
  ]);
  const ask = new Set(asks);
  return {
    matchId: pair.matchId,
    me: { name: pair.me.name, firstName: pair.me.firstName },
    other: {
      id: pair.other.id,
      name: pair.other.name,
      firstName: pair.other.firstName,
      email: pair.other.email,
      summary: pair.other.summary || null,
      tags: tags(pair.other.tags),
      githubUrl: pair.other.githubUrl,
      linkedinUrl: pair.other.linkedinUrl,
      isDemo: demo.has(pair.other.id),
    },
    coffeeChat: pair.coffeeChat,
    events: pair.events.map((event) => ({ ...event, askToKeepMatching: ask.has(event.id) })),
    teams: pair.teams.map((team) => ({
      id: team.id,
      eventId: team.eventId,
      eventName: team.eventName,
      members: team.members.map((member) => ({ id: member.id, name: member.name })),
    })),
  };
}

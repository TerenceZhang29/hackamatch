import "server-only";
import { getConfig } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";
import { localDateString } from "@/lib/time";
import { firstName } from "./matches";
import type { Tables } from "@/types/db";

export type EventSummary = Pick<
  Tables<"events">,
  "id" | "slug" | "name" | "start_date" | "end_date" | "team_size_min" | "team_size_max"
>;

const SUMMARY_COLUMNS = "id, slug, name, start_date, end_date, team_size_min, team_size_max";

/** Events that have not ended yet (in APP_TIMEZONE), soonest first. */
export async function listUpcomingEvents(): Promise<EventSummary[]> {
  const today = localDateString(getConfig().APP_TIMEZONE);
  const { data, error } = await createServiceClient()
    .from("events")
    .select(SUMMARY_COLUMNS)
    .gte("end_date", today)
    .order("start_date", { ascending: true });
  if (error) throw new Error(`listUpcomingEvents: ${error.message}`);
  return data;
}

/** Keeps only ids of events that exist and have not ended. */
export async function filterUpcomingEventIds(eventIds: readonly string[]): Promise<string[]> {
  if (eventIds.length === 0) return [];
  const upcoming = new Set((await listUpcomingEvents()).map((event) => event.id));
  return [...new Set(eventIds)].filter((id) => upcoming.has(id));
}

/** Adds the user's interest in each event; existing rows are left alone. */
export async function addEventInterests(userId: string, eventIds: readonly string[]) {
  if (eventIds.length === 0) return;
  const { error } = await createServiceClient()
    .from("event_interests")
    .upsert(
      eventIds.map((eventId) => ({ user_id: userId, event_id: eventId })),
      { onConflict: "user_id,event_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`addEventInterests: ${error.message}`);
}

/** Removes the user's interest in one event. */
export async function removeEventInterest(userId: string, eventId: string) {
  const { error } = await createServiceClient()
    .from("event_interests")
    .delete()
    .eq("user_id", userId)
    .eq("event_id", eventId);
  if (error) throw new Error(`removeEventInterest: ${error.message}`);
}

/** Ids of the events a user has said they are interested in. */
export async function listEventInterestIds(userId: string): Promise<string[]> {
  const { data, error } = await createServiceClient()
    .from("event_interests")
    .select("event_id")
    .eq("user_id", userId);
  if (error) throw new Error(`listEventInterestIds: ${error.message}`);
  return data.map((row) => row.event_id).filter((id): id is string => id !== null);
}

export type EventDetail = Pick<
  Tables<"events">,
  | "id"
  | "slug"
  | "name"
  | "description"
  | "url"
  | "start_date"
  | "end_date"
  | "team_size_min"
  | "team_size_max"
>;

export async function getEventById(id: string): Promise<EventDetail | null> {
  const { data, error } = await createServiceClient()
    .from("events")
    .select("id, slug, name, description, url, start_date, end_date, team_size_min, team_size_max")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getEventById: ${error.message}`);
  return data;
}

export async function getEventBySlug(slug: string): Promise<EventDetail | null> {
  const { data, error } = await createServiceClient()
    .from("events")
    .select("id, slug, name, description, url, start_date, end_date, team_size_min, team_size_max")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`getEventBySlug: ${error.message}`);
  return data;
}

/** How many people in an event's pool (onboarded, not paused, not left the pool) tagged it. */
export async function countEventInterest(eventId: string): Promise<number> {
  const { count, error } = await createServiceClient()
    .from("event_interests")
    .select("user_id, users!inner(onboarded_at, paused_until)", { count: "exact", head: true })
    .eq("event_id", eventId)
    .is("left_pool_at", null)
    .not("users.onboarded_at", "is", null)
    .or(`paused_until.is.null,paused_until.lt.${new Date().toISOString()}`, {
      referencedTable: "users",
    });
  if (error) throw new Error(`countEventInterest: ${error.message}`);
  return count ?? 0;
}

/** Whether an event has ended, in APP_TIMEZONE. */
export function hasEnded(event: Pick<Tables<"events">, "end_date">): boolean {
  return event.end_date < localDateString(getConfig().APP_TIMEZONE);
}

/**
 * The event a post-sign-in `next` path points at when it is an event join link
 * (`/e/<slug>?join=1`), so onboarding can preselect it.
 */
export async function eventFromJoinPath(next: string | null): Promise<string | null> {
  if (!next) return null;
  const url = new URL(next, "http://internal.invalid");
  const slug = /^\/e\/([a-z0-9-]+)$/.exec(url.pathname)?.[1];
  if (!slug || url.searchParams.get("join") !== "1") return null;
  const event = await getEventBySlug(slug);
  return event && !hasEnded(event) ? event.id : null;
}

export interface EventMatch {
  matchId: string;
  firstName: string;
}

/**
 * The user's matches for an event: mutual (revealed) matches where both
 * people picked the event on their pair page. Oldest first.
 */
export async function listEventMatches(userId: string, eventId: string): Promise<EventMatch[]> {
  const supabase = createServiceClient();
  const { data: matches, error } = await supabase
    .from("matches")
    .select("id, user_a, user_b, revealed_at")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .not("revealed_at", "is", null)
    .order("revealed_at");
  if (error) throw new Error(`listEventMatches: ${error.message}`);
  if (matches.length === 0) return [];

  const { data: votes, error: votesError } = await supabase
    .from("match_event_votes")
    .select("match_id, user_id")
    .eq("event_id", eventId)
    .in(
      "match_id",
      matches.map((m) => m.id),
    );
  if (votesError) throw new Error(`listEventMatches: ${votesError.message}`);
  const both = matches.filter(
    (m) => new Set(votes.filter((v) => v.match_id === m.id).map((v) => v.user_id)).size === 2,
  );
  if (both.length === 0) return [];

  const otherIds = both.map((m) => (m.user_a === userId ? m.user_b : m.user_a));
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, name, cornell_email")
    .in("id", otherIds);
  if (usersError) throw new Error(`listEventMatches: ${usersError.message}`);
  return both.map((m, index) => {
    const other = users.find((u) => u.id === otherIds[index]);
    return {
      matchId: m.id,
      firstName: other ? firstName(other.name, other.cornell_email) : "Someone",
    };
  });
}

export interface EventPool {
  /** Tagged the event ("I'm going"). */
  going: boolean;
  /** Going, but left the pool ("I have my team"). */
  leftPool: boolean;
  matches: EventMatch[];
  /** A new match since they were last asked "keep matching?". */
  askToKeepMatching: boolean;
}

/** Where the user stands in an event's pool, and whether to ask them about new matches. */
export async function getEventPool(userId: string, eventId: string): Promise<EventPool> {
  const [{ data: interest, error }, matches] = await Promise.all([
    createServiceClient()
      .from("event_interests")
      .select("left_pool_at, prompted_matches")
      .eq("user_id", userId)
      .eq("event_id", eventId)
      .maybeSingle(),
    listEventMatches(userId, eventId),
  ]);
  if (error) throw new Error(`getEventPool: ${error.message}`);
  const leftPool = Boolean(interest?.left_pool_at);
  return {
    going: interest !== null,
    leftPool,
    matches,
    askToKeepMatching: interest !== null && !leftPool && matches.length > interest.prompted_matches,
  };
}

/**
 * Answers "keep matching for this event?" (or leaves / rejoins from the event
 * page). Either way the current matches count as asked about.
 */
export async function setInEventPool(userId: string, eventId: string, inPool: boolean) {
  const matches = await listEventMatches(userId, eventId);
  const { error } = await createServiceClient()
    .from("event_interests")
    .update({
      left_pool_at: inPool ? null : new Date().toISOString(),
      prompted_matches: matches.length,
    })
    .eq("user_id", userId)
    .eq("event_id", eventId);
  if (error) throw new Error(`setInEventPool: ${error.message}`);
}

/**
 * Tags an event for team members who hadn't tagged it: going, but out of the
 * pool, with their current matches for it counted as asked about. Members who
 * already tagged it keep whatever they chose.
 */
export async function markGoingWithTeam(userIds: readonly string[], eventId: string) {
  if (userIds.length === 0) return;
  const supabase = createServiceClient();
  const { data: existing, error } = await supabase
    .from("event_interests")
    .select("user_id")
    .eq("event_id", eventId)
    .in("user_id", [...userIds]);
  if (error) throw new Error(`markGoingWithTeam: ${error.message}`);
  const tagged = new Set(existing.map((row) => row.user_id));
  const untagged = [...new Set(userIds)].filter((id) => !tagged.has(id));
  if (untagged.length === 0) return;
  const now = new Date().toISOString();
  const rows = await Promise.all(
    untagged.map(async (userId) => ({
      user_id: userId,
      event_id: eventId,
      left_pool_at: now,
      prompted_matches: (await listEventMatches(userId, eventId)).length,
    })),
  );
  const { error: insertError } = await supabase
    .from("event_interests")
    .upsert(rows, { onConflict: "user_id,event_id", ignoreDuplicates: true });
  if (insertError) throw new Error(`markGoingWithTeam: ${insertError.message}`);
}

export interface TeamMate {
  id: string;
  firstName: string;
  /** Your pair page with them, when you have a mutual match. */
  matchId: string | null;
}

export interface MyEvent {
  id: string;
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
  /** looking: going and in the pool; have-team: going, left the pool; not-going: never tagged it. */
  status: "looking" | "have-team" | "not-going";
  askToKeepMatching: boolean;
  /** Your teams for the event, without you. */
  teams: { id: string; members: TeamMate[] }[];
  /** Matches for the event who aren't on one of your teams for it. */
  matchedNoTeam: EventMatch[];
}

export interface MyHackathons {
  events: MyEvent[];
  /** Teams with no event. */
  sideProjects: { id: string; members: TeamMate[] }[];
}

/**
 * Every upcoming event the user is involved in (tagged, on a team, or matched
 * for it), soonest first, plus their side-project teams. A fixed handful of
 * queries however many events or matches there are.
 */
export async function listMyEvents(userId: string): Promise<MyHackathons> {
  const supabase = createServiceClient();
  const [interests, matches, memberships] = await Promise.all([
    supabase
      .from("event_interests")
      .select("event_id, left_pool_at, prompted_matches")
      .eq("user_id", userId),
    supabase
      .from("matches")
      .select("id, user_a, user_b, revealed_at")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .not("revealed_at", "is", null)
      .order("revealed_at"),
    supabase.from("team_members").select("team_id, teams(id, event_id)").eq("user_id", userId),
  ]);
  for (const result of [interests, matches, memberships]) {
    if (result.error) throw new Error(`listMyEvents: ${result.error.message}`);
  }
  const otherOf = (m: { user_a: string; user_b: string }) =>
    m.user_a === userId ? m.user_b : m.user_a;
  const matchIdWith = new Map(matches.data!.map((m) => [otherOf(m), m.id]));
  const teams = memberships
    .data!.map((row) => row.teams)
    .filter((t): t is { id: string; event_id: string | null } => t !== null);

  const [votes, teamMembers] = await Promise.all([
    matches.data!.length
      ? supabase
          .from("match_event_votes")
          .select("match_id, user_id, event_id")
          .in(
            "match_id",
            matches.data!.map((m) => m.id),
          )
      : Promise.resolve({
          data: [] as { match_id: string; user_id: string; event_id: string }[],
          error: null,
        }),
    teams.length
      ? supabase
          .from("team_members")
          .select("team_id, user_id")
          .in(
            "team_id",
            teams.map((t) => t.id),
          )
      : Promise.resolve({ data: [] as { team_id: string; user_id: string }[], error: null }),
  ]);
  for (const result of [votes, teamMembers]) {
    if (result.error) throw new Error(`listMyEvents: ${result.error.message}`);
  }

  // Matches for each event: both people picked it.
  const pickedBy = new Map<string, Set<string>>();
  for (const vote of votes.data!) {
    const key = `${vote.match_id}:${vote.event_id}`;
    pickedBy.set(key, (pickedBy.get(key) ?? new Set()).add(vote.user_id));
  }
  const eventMatchIds = new Map<string, string[]>();
  for (const [key, users] of pickedBy) {
    if (users.size < 2) continue;
    const [matchId, eventId] = key.split(":") as [string, string];
    eventMatchIds.set(eventId, [...(eventMatchIds.get(eventId) ?? []), matchId]);
  }

  const eventIds = [
    ...new Set([
      ...interests.data!.map((i) => i.event_id),
      ...eventMatchIds.keys(),
      ...teams.map((t) => t.event_id),
    ]),
  ].filter((id): id is string => !!id);
  const peopleIds = [
    ...new Set([
      ...matches.data!.map(otherOf),
      ...teamMembers.data!.map((m) => m.user_id).filter((id) => id !== userId),
    ]),
  ];
  const today = localDateString(getConfig().APP_TIMEZONE);
  const [events, people] = await Promise.all([
    eventIds.length
      ? supabase
          .from("events")
          .select("id, slug, name, start_date, end_date")
          .in("id", eventIds)
          .gte("end_date", today)
          .order("start_date")
      : Promise.resolve({
          data: [] as {
            id: string;
            slug: string;
            name: string;
            start_date: string;
            end_date: string;
          }[],
          error: null,
        }),
    peopleIds.length
      ? supabase.from("users").select("id, name, cornell_email").in("id", peopleIds)
      : Promise.resolve({
          data: [] as { id: string; name: string | null; cornell_email: string }[],
          error: null,
        }),
  ]);
  for (const result of [events, people]) {
    if (result.error) throw new Error(`listMyEvents: ${result.error.message}`);
  }

  const nameOf = (id: string) => {
    const person = people.data!.find((p) => p.id === id);
    return person ? firstName(person.name, person.cornell_email) : "Someone";
  };
  const teamOf = (team: { id: string }) => ({
    id: team.id,
    members: teamMembers
      .data!.filter((m) => m.team_id === team.id && m.user_id !== userId)
      .map((m) => ({
        id: m.user_id,
        firstName: nameOf(m.user_id),
        matchId: matchIdWith.get(m.user_id) ?? null,
      })),
  });
  const matchById = new Map(matches.data!.map((m) => [m.id, m]));

  return {
    events: events.data!.map((event) => {
      const interest = interests.data!.find((i) => i.event_id === event.id);
      const myTeams = teams.filter((t) => t.event_id === event.id).map(teamOf);
      const onTeam = new Set(myTeams.flatMap((t) => t.members.map((m) => m.id)));
      const eventMatches = (eventMatchIds.get(event.id) ?? [])
        .map((id) => matchById.get(id)!)
        .sort((x, y) => x.revealed_at!.localeCompare(y.revealed_at!));
      const status = !interest ? "not-going" : interest.left_pool_at ? "have-team" : "looking";
      return {
        id: event.id,
        slug: event.slug,
        name: event.name,
        startDate: event.start_date,
        endDate: event.end_date,
        status,
        askToKeepMatching:
          status === "looking" && eventMatches.length > (interest?.prompted_matches ?? 0),
        teams: myTeams,
        matchedNoTeam: eventMatches
          .filter((m) => !onTeam.has(otherOf(m)))
          .map((m) => ({ matchId: m.id, firstName: nameOf(otherOf(m)) })),
      };
    }),
    sideProjects: teams.filter((t) => t.event_id === null).map(teamOf),
  };
}

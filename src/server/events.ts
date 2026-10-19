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

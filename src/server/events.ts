import "server-only";
import { getConfig } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";
import { localDateString } from "@/lib/time";
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

import "server-only";
import type { BoardFilters } from "@/lib/board";
import { getConfig } from "@/lib/config";
import { nearestPoolEvents, type PoolEvent } from "@/lib/person-card";
import { localDateString } from "@/lib/time";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/db";
import { passedCards } from "./card-passes";

/** Public board reads, through the security-definer SQL functions that expose only safe columns. */

export type BoardPerson = Database["public"]["Functions"]["public_board_people"]["Returns"][number];

/**
 * Users a signed-in viewer should not see on the board: themselves and
 * everyone they already have a match with (whatever either side answered).
 */
export async function excludedUserIds(viewerId: string | null): Promise<string[]> {
  if (!viewerId) return [];
  const { data, error } = await createServiceClient()
    .from("matches")
    .select("user_a, user_b")
    .or(`user_a.eq.${viewerId},user_b.eq.${viewerId}`);
  if (error) throw new Error(`excludedUserIds: ${error.message}`);
  return [viewerId, ...data.map((m) => (m.user_a === viewerId ? m.user_b : m.user_a))];
}

/**
 * What a signed-in viewer's lists leave out: people they already have a
 * match with (excludedUserIds), and the people they passed (P1-23). Nothing
 * for visitors.
 */
export async function boardExclusions(
  viewerId: string | null,
): Promise<{ users: string[]; people: string[] }> {
  if (!viewerId) return { users: [], people: [] };
  const [users, passed] = await Promise.all([excludedUserIds(viewerId), passedCards(viewerId)]);
  return { users, people: [...users, ...passed.people] };
}

/** Everyone in the pool (P1-24: no roles), one more row than asked for so callers know whether there's more. */
export async function listBoardPeople(
  filters: BoardFilters,
  limit: number,
  exclude: string[],
): Promise<{ rows: BoardPerson[]; hasMore: boolean }> {
  const { data, error } = await createServiceClient().rpc("public_board_people", {
    p_limit: limit + 1,
    p_offset: 0,
    p_event_slug: filters.event ?? undefined,
    p_domain: filters.domain ?? undefined,
    p_skill: filters.skill ?? undefined,
    p_exclude_user_ids: exclude,
  });
  if (error) throw new Error(`listBoardPeople: ${error.message}`);
  return { rows: data.slice(0, limit), hasMore: data.length > limit };
}

/** One person's public card, or null when they are not in the pool. */
export async function getPublicPerson(userId: string): Promise<BoardPerson | null> {
  const { data, error } = await createServiceClient().rpc("public_person", { p_id: userId });
  if (error) throw new Error(`getPublicPerson: ${error.message}`);
  return data[0] ?? null;
}

/**
 * Each person's nearest three upcoming hackathons where they're still in the
 * pool (going, and not "I have my team"), for "Looking for" on person cards.
 */
export async function poolEventsFor(userIds: readonly string[]): Promise<Map<string, PoolEvent[]>> {
  if (userIds.length === 0) return new Map();
  const today = localDateString(getConfig().APP_TIMEZONE);
  const { data, error } = await createServiceClient()
    .from("event_interests")
    .select("user_id, events!inner(id, name, start_date, end_date)")
    .in("user_id", [...userIds])
    .is("left_pool_at", null)
    .gte("events.end_date", today);
  if (error) throw new Error(`poolEventsFor: ${error.message}`);
  const byUser = new Map<string, PoolEvent[]>();
  for (const row of data) {
    const list = byUser.get(row.user_id) ?? [];
    list.push({ id: row.events.id, name: row.events.name, startDate: row.events.start_date });
    byUser.set(row.user_id, list);
  }
  for (const [id, list] of byUser) byUser.set(id, nearestPoolEvents(list));
  return byUser;
}

/** Which of these people are demo profiles, so cards can say "Demo" (docs/plans/demo-profiles.md). */
export async function demoUserIds(userIds: readonly string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const { data, error } = await createServiceClient()
    .from("users")
    .select("id")
    .in("id", [...userIds])
    .eq("is_demo", true);
  if (error) throw new Error(`demoUserIds: ${error.message}`);
  return new Set(data.map((u) => u.id));
}

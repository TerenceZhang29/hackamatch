import "server-only";
import type { BoardFilters } from "@/lib/board";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/db";

/** Public board reads, through the security-definer SQL functions that expose only safe columns. */

export type BoardIdea = Database["public"]["Functions"]["public_board_ideas"]["Returns"][number];
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

/** One more row than asked for, so callers know whether "Load more" has anything to load. */
export async function listBoardIdeas(
  filters: BoardFilters,
  limit: number,
  exclude: string[],
): Promise<{ rows: BoardIdea[]; hasMore: boolean }> {
  const { data, error } = await createServiceClient().rpc("public_board_ideas", {
    p_limit: limit + 1,
    p_offset: 0,
    p_event_slug: filters.event ?? undefined,
    p_domain: filters.domain ?? undefined,
    p_skill: filters.skill ?? undefined,
    p_intent: filters.intent ?? undefined,
    p_exclude_user_ids: exclude,
  });
  if (error) throw new Error(`listBoardIdeas: ${error.message}`);
  return { rows: data.slice(0, limit), hasMore: data.length > limit };
}

/** Builders (and "both") by default; `role: null` lists every role, as event pages do. */
export async function listBoardPeople(
  filters: BoardFilters,
  limit: number,
  exclude: string[],
  role: "builder" | null = "builder",
): Promise<{ rows: BoardPerson[]; hasMore: boolean }> {
  const { data, error } = await createServiceClient().rpc("public_board_people", {
    p_limit: limit + 1,
    p_offset: 0,
    p_role: role ?? undefined,
    p_event_slug: filters.event ?? undefined,
    p_domain: filters.domain ?? undefined,
    p_skill: filters.skill ?? undefined,
    p_intent: filters.intent ?? undefined,
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

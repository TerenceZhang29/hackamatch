import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { Enums, Tables } from "@/types/db";

/** Idea reads and writes. Service client: callers must pass an authenticated user's id. */

export type IdeaStatus = Enums<"idea_status">;
export type Idea = Tables<"ideas">;

export const OWNER_IDEA_COLUMNS =
  "id, raw_text, pitch, domain, skills_needed, scope, status, clarifying_question, event_id, featured, created_at";
export type OwnerIdea = Pick<
  Idea,
  | "id"
  | "raw_text"
  | "pitch"
  | "domain"
  | "skills_needed"
  | "scope"
  | "status"
  | "clarifying_question"
  | "event_id"
  | "featured"
  | "created_at"
>;

/** All of a user's ideas, newest first. */
export async function listOwnIdeas(userId: string): Promise<OwnerIdea[]> {
  const { data, error } = await createServiceClient()
    .from("ideas")
    .select(OWNER_IDEA_COLUMNS)
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listOwnIdeas: ${error.message}`);
  return data;
}

/** Sets an idea's status. Returns false when the idea is not the user's. */
export async function setIdeaStatus(
  userId: string,
  ideaId: string,
  status: IdeaStatus,
): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("ideas")
    .update({ status })
    .eq("id", ideaId)
    .eq("owner_id", userId)
    .select("id");
  if (error) throw new Error(`setIdeaStatus: ${error.message}`);
  return data.length === 1;
}

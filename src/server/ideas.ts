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

export type IdeaScope = Enums<"idea_scope">;

export interface NewIdea {
  rawText: string;
  eventId: string | null;
  pitch: string | null;
  domain: string | null;
  skillsNeeded: string[];
  scope: IdeaScope | null;
  clarifyingQuestion: string | null;
}

/**
 * Creates an idea for an onboarded user. A builder who posts an idea becomes
 * "both", since they now have an idea too.
 */
export async function createIdea(userId: string, idea: NewIdea): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ideas")
    .insert({
      owner_id: userId,
      event_id: idea.eventId,
      raw_text: idea.rawText,
      pitch: idea.pitch,
      domain: idea.domain,
      skills_needed: idea.skillsNeeded,
      scope: idea.scope,
      clarifying_question: idea.clarifyingQuestion,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createIdea: ${error.message}`);

  const { error: roleError } = await supabase
    .from("users")
    .update({ role: "both" })
    .eq("id", userId)
    .eq("role", "builder");
  if (roleError) throw new Error(`createIdea: ${roleError.message}`);
  return data.id;
}

/** The idea with every column, when `userId` owns it; otherwise null. */
export async function getOwnIdea(userId: string, ideaId: string): Promise<OwnerIdea | null> {
  const { data, error } = await createServiceClient()
    .from("ideas")
    .select(OWNER_IDEA_COLUMNS)
    .eq("id", ideaId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getOwnIdea: ${error.message}`);
  return data;
}

export type PublicIdea = {
  id: string;
  owner_id: string;
  pitch: string | null;
  domain: string | null;
  skills_needed: string[];
  scope: IdeaScope | null;
  status: IdeaStatus;
  event_id: string | null;
  featured: boolean;
  created_at: string;
  owner_display: string;
};

/** An idea's public fields (never raw_text), or null when it is hidden. */
export async function getPublicIdea(ideaId: string): Promise<PublicIdea | null> {
  const { data, error } = await createServiceClient().rpc("public_idea", { p_id: ideaId });
  if (error) throw new Error(`getPublicIdea: ${error.message}`);
  return (data[0] as PublicIdea | undefined) ?? null;
}

/**
 * The full text of an idea, for a viewer who has a revealed (mutual) match on
 * it; otherwise null. Mirrors the RLS rule on `ideas`.
 */
export async function getRevealedIdeaText(userId: string, ideaId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data: match, error } = await supabase
    .from("matches")
    .select("id")
    .eq("idea_id", ideaId)
    .not("revealed_at", "is", null)
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getRevealedIdeaText: ${error.message}`);
  if (!match) return null;
  const { data: idea, error: ideaError } = await supabase
    .from("ideas")
    .select("raw_text")
    .eq("id", ideaId)
    .single();
  if (ideaError) throw new Error(`getRevealedIdeaText: ${ideaError.message}`);
  return idea.raw_text;
}

/** Owner edits to an idea's public tags. Returns false when the idea is not theirs. */
export async function updateIdeaTags(
  userId: string,
  ideaId: string,
  tags: { skillsNeeded: string[]; domain: string | null; scope: IdeaScope | null },
): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("ideas")
    .update({ skills_needed: tags.skillsNeeded, domain: tags.domain, scope: tags.scope })
    .eq("id", ideaId)
    .eq("owner_id", userId)
    .select("id");
  if (error) throw new Error(`updateIdeaTags: ${error.message}`);
  return data.length === 1;
}

/** Re-runs extraction on an idea's text and saves its public fields. Throws `LlmError`. */
export async function refreshIdeaExtraction(ideaId: string, options: { timeoutMs?: number } = {}) {
  const { extractIdea } = await import("@/lib/llm/extract-idea");
  const supabase = createServiceClient();
  const { data: idea, error } = await supabase
    .from("ideas")
    .select("raw_text")
    .eq("id", ideaId)
    .single();
  if (error) throw new Error(`refreshIdeaExtraction: ${error.message}`);

  const extracted = await extractIdea({ text: idea.raw_text }, options);
  const { error: updateError } = await supabase
    .from("ideas")
    .update({
      pitch: extracted.pitch,
      domain: extracted.domain,
      skills_needed: extracted.skills_needed,
      scope: extracted.scope,
      clarifying_question: extracted.clarifying_question,
    })
    .eq("id", ideaId);
  if (updateError) throw new Error(`refreshIdeaExtraction: ${updateError.message}`);
}

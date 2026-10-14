import "server-only";
import { embed } from "@/lib/embeddings";
import { createServiceClient } from "@/lib/supabase/service";
import type { Tables } from "@/types/db";

/**
 * Builds the text that represents a profile or an idea in embedding space, and
 * stores the resulting vectors. Runs with the service client: callers must
 * have authorized the user first.
 */

type UserFields = Pick<Tables<"users">, "role" | "intents" | "raw_bio">;
type ProfileFields = Pick<Tables<"profiles">, "skills" | "stack" | "domains">;
type IdeaFields = Pick<Tables<"ideas">, "raw_text" | "domain" | "skills_needed">;

/** Joins labelled sections, leaving out the empty ones. */
function sections(parts: [label: string, value: string | null | undefined][]): string {
  return parts
    .map(([label, value]) => [label, value?.trim()] as const)
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join(" ");
}

/** `githubSummary` is the text built from the user's public GitHub profile (P1-07), if any. */
export function profileEmbeddingText(
  user: UserFields,
  profile: ProfileFields,
  githubSummary?: string | null,
): string {
  return sections([
    ["Role", user.role],
    ["Intents", user.intents.join(", ")],
    ["Skills", profile.skills.join(", ")],
    ["Stack", profile.stack.join(", ")],
    ["Domains", profile.domains.join(", ")],
    ["About", [user.raw_bio, githubSummary].filter(Boolean).join(" ")],
  ]);
}

export function ideaEmbeddingText(idea: IdeaFields): string {
  return sections([
    ["Idea", idea.raw_text],
    ["Domain", idea.domain],
    ["Needs", idea.skills_needed.join(", ")],
  ]);
}

/** Embeds one stored text and returns it in pgvector's text form, which is how supabase-js sends a `vector` column. */
async function embedDocument(text: string): Promise<string> {
  const [vector] = await embed([text], "document");
  if (!vector) throw new Error("embed returned no vector");
  return `[${vector.join(",")}]`;
}

/**
 * Embeds a user's profile and stores the vector. Uses the stored GitHub
 * summary unless one is passed. Throws if the user is missing or a step fails.
 */
export async function embedProfile(
  userId: string,
  options: { githubSummary?: string | null } = {},
): Promise<void> {
  const supabase = createServiceClient();
  const [user, profile] = await Promise.all([
    supabase.from("users").select("role, intents, raw_bio").eq("id", userId).single(),
    supabase
      .from("profiles")
      .select("skills, stack, domains, github_summary")
      .eq("user_id", userId)
      .single(),
  ]);
  if (user.error) throw new Error(`embedProfile: ${user.error.message}`);
  if (profile.error) throw new Error(`embedProfile: ${profile.error.message}`);

  const embedding = await embedDocument(
    profileEmbeddingText(
      user.data,
      profile.data,
      options.githubSummary ?? profile.data.github_summary,
    ),
  );

  const { error } = await supabase
    .from("profiles")
    .update({ embedding, embedded_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(`embedProfile: ${error.message}`);
}

/** Embeds an idea and stores the vector. Throws if the idea is missing or a step fails. */
export async function embedIdea(ideaId: string): Promise<void> {
  const supabase = createServiceClient();
  const idea = await supabase
    .from("ideas")
    .select("raw_text, domain, skills_needed")
    .eq("id", ideaId)
    .single();
  if (idea.error) throw new Error(`embedIdea: ${idea.error.message}`);

  const embedding = await embedDocument(ideaEmbeddingText(idea.data));

  const { error } = await supabase.from("ideas").update({ embedding }).eq("id", ideaId);
  if (error) throw new Error(`embedIdea: ${error.message}`);
}

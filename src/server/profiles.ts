import "server-only";
import { extractIdea } from "@/lib/llm/extract-idea";
import { extractProfile } from "@/lib/llm/extract-profile";
import { PROMPT_VERSION } from "@/lib/llm/prompts";
import { normalizeTags } from "@/lib/taxonomy/normalize";
import { createServiceClient } from "@/lib/supabase/service";
import type { Enums } from "@/types/db";
import { embedIdea, embedProfile } from "./embed";

/**
 * Profile and onboarding writes. Uses the service client (it writes derived
 * columns such as extraction metadata that users cannot), so every caller must
 * pass the id of a user it has already authenticated.
 */

export type Role = Enums<"user_role">;
export type Intent = Enums<"user_intent">;

export interface ProfileTags {
  skills: string[];
  stack: string[];
  domains: string[];
}

export interface OnboardingIdea {
  id: string;
  pitch: string | null;
  clarifying_question: string | null;
}

export interface ExtractionResult {
  summary: string | null;
  tags: ProfileTags;
  idea: OnboardingIdea | null;
}

/** Maps tags onto the taxonomy, so hand-edited tags obey the same vocabulary as LLM tags. */
export function normalizeProfileTags(tags: ProfileTags): ProfileTags {
  return {
    skills: normalizeTags("skills", tags.skills),
    stack: normalizeTags("stack", tags.stack),
    domains: normalizeTags("domains", tags.domains),
  };
}

function sameTags(a: ProfileTags, b: ProfileTags): boolean {
  const same = (x: string[], y: string[]) =>
    x.length === y.length && [...x].sort().join() === [...y].sort().join();
  return same(a.skills, b.skills) && same(a.stack, b.stack) && same(a.domains, b.domains);
}

/** Step 1 and 2 of onboarding: who the user is and their one sentence. */
export async function saveOnboardingBasics(
  userId: string,
  input: {
    name: string | null;
    role: Role;
    intents: Intent[];
    sentence: string;
    githubUrl: string | null;
    githubSummary: string | null;
    linkedinUrl: string | null;
    linkedinText: string | null;
  },
) {
  const supabase = createServiceClient();
  const update: {
    role: Role;
    intents: Intent[];
    raw_bio: string;
    github_url: string | null;
    linkedin_url: string | null;
    linkedin_text: string | null;
    name?: string;
  } = {
    role: input.role,
    intents: input.intents,
    raw_bio: input.sentence,
    github_url: input.githubUrl,
    linkedin_url: input.linkedinUrl,
    linkedin_text: input.linkedinText,
  };
  // An empty name field never erases a name we already have.
  if (input.name) update.name = input.name;

  const { error } = await supabase.from("users").update(update).eq("id", userId);
  if (error) throw new Error(`saveOnboardingBasics: ${error.message}`);

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ github_summary: input.githubSummary })
    .eq("user_id", userId);
  if (profileError) throw new Error(`saveOnboardingBasics: ${profileError.message}`);
}

/**
 * Runs LLM extraction on the user's stored sentence and writes the result:
 * summary, experience level and (unless the user has edited them) tags. For
 * idea people it also creates their first idea. Throws `LlmError` on LLM
 * failure, so callers can fall back to running it in the background.
 *
 * Safe to run more than once while the user is still onboarding: an earlier
 * onboarding idea is replaced, not duplicated.
 */
export async function runProfileExtraction(
  userId: string,
  options: { timeoutMs?: number } = {},
): Promise<ExtractionResult> {
  const supabase = createServiceClient();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("role, raw_bio, linkedin_text, onboarded_at")
    .eq("id", userId)
    .single();
  if (userError) throw new Error(`runProfileExtraction: ${userError.message}`);
  if (!user.role || !user.raw_bio) throw new Error("runProfileExtraction: role and sentence first");

  const { data: current, error: profileError } = await supabase
    .from("profiles")
    .select("user_edited, skills, stack, domains, github_summary")
    .eq("user_id", userId)
    .single();
  if (profileError) throw new Error(`runProfileExtraction: ${profileError.message}`);

  const extracted = await extractProfile(
    {
      role: user.role,
      sentence: user.raw_bio,
      githubSummary: current.github_summary,
      linkedinText: user.linkedin_text,
    },
    { timeoutMs: options.timeoutMs },
  );

  // Tags the user has edited are theirs; extraction never overwrites them.
  const tags: ProfileTags = current.user_edited
    ? { skills: current.skills, stack: current.stack, domains: current.domains }
    : { skills: extracted.skills, stack: extracted.stack, domains: extracted.domains };

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      summary: extracted.summary,
      experience_level: extracted.experience_level,
      ...tags,
      extraction_model: PROMPT_VERSION,
      extracted_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (updateError) throw new Error(`runProfileExtraction: ${updateError.message}`);

  const idea = await saveOnboardingIdea(userId, user.onboarded_at, user.raw_bio, extracted.idea);
  return { summary: extracted.summary, tags, idea };
}

/**
 * The idea from an idea person's onboarding sentence. While the user is still
 * onboarding, a re-run replaces the earlier one. Once they have joined (a late
 * background run), it is only added if they have no ideas yet.
 */
async function saveOnboardingIdea(
  userId: string,
  onboardedAt: string | null,
  sentence: string,
  idea: Awaited<ReturnType<typeof extractProfile>>["idea"],
): Promise<OnboardingIdea | null> {
  const supabase = createServiceClient();

  if (!onboardedAt) {
    const { error } = await supabase.from("ideas").delete().eq("owner_id", userId);
    if (error) throw new Error(`saveOnboardingIdea: ${error.message}`);
  } else {
    const { count, error } = await supabase
      .from("ideas")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId);
    if (error) throw new Error(`saveOnboardingIdea: ${error.message}`);
    if ((count ?? 0) > 0) return null;
  }
  if (!idea) return null;

  const { data, error } = await supabase
    .from("ideas")
    .insert({
      owner_id: userId,
      raw_text: sentence,
      pitch: idea.pitch,
      domain: idea.domain,
      skills_needed: idea.skills_needed,
      scope: idea.scope,
      clarifying_question: idea.clarifying_question,
    })
    .select("id, pitch, clarifying_question")
    .single();
  if (error) throw new Error(`saveOnboardingIdea: ${error.message}`);
  return data;
}

/**
 * Saves tags the user edited by hand. Marks the profile `user_edited` only
 * when they differ from what is stored, so untouched LLM tags can still be
 * refreshed later. Returns whether anything changed.
 */
export async function saveEditedTags(userId: string, tags: ProfileTags): Promise<boolean> {
  const supabase = createServiceClient();
  const normalized = normalizeProfileTags(tags);
  const { data: current, error } = await supabase
    .from("profiles")
    .select("skills, stack, domains")
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(`saveEditedTags: ${error.message}`);
  if (sameTags(current, normalized)) return false;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ ...normalized, user_edited: true })
    .eq("user_id", userId);
  if (updateError) throw new Error(`saveEditedTags: ${updateError.message}`);
  return true;
}

/**
 * Adds the answer to an idea's clarifying question, re-extracts its public
 * fields and clears the question. Only the idea's owner may call this.
 */
export async function answerClarifyingQuestion(userId: string, ideaId: string, answer: string) {
  const supabase = createServiceClient();
  const { data: idea, error } = await supabase
    .from("ideas")
    .select("raw_text, owner_id")
    .eq("id", ideaId)
    .single();
  if (error) throw new Error(`answerClarifyingQuestion: ${error.message}`);
  if (idea.owner_id !== userId) throw new Error("answerClarifyingQuestion: not the owner");

  const rawText = `${idea.raw_text.trim()}\n\n${answer.trim()}`;
  const { error: textError } = await supabase
    .from("ideas")
    .update({ raw_text: rawText, clarifying_question: null })
    .eq("id", ideaId);
  if (textError) throw new Error(`answerClarifyingQuestion: ${textError.message}`);

  const extracted = await extractIdea({ text: rawText });
  const { error: updateError } = await supabase
    .from("ideas")
    .update({
      pitch: extracted.pitch,
      domain: extracted.domain,
      skills_needed: extracted.skills_needed,
      scope: extracted.scope,
    })
    .eq("id", ideaId);
  if (updateError) throw new Error(`answerClarifyingQuestion: ${updateError.message}`);
}

/**
 * Marks the user as in the pool. Returns seconds since they clicked their
 * magic link when this call is the one that joined them, or null when they
 * had already joined.
 */
export async function markJoinedPool(
  userId: string,
): Promise<{ secondsSinceLinkClick: number | null } | null> {
  const supabase = createServiceClient();
  const now = new Date();
  const { data, error } = await supabase
    .from("users")
    .update({ onboarded_at: now.toISOString() })
    .eq("id", userId)
    .is("onboarded_at", null)
    .select("onboarding_started_at");
  if (error) throw new Error(`markJoinedPool: ${error.message}`);
  const row = data[0];
  if (!row) return null;
  const started = row.onboarding_started_at ? new Date(row.onboarding_started_at) : null;
  return {
    secondsSinceLinkClick: started ? Math.round((now.getTime() - started.getTime()) / 1000) : null,
  };
}

/** Embeds the profile and every idea of a user who is in the pool. Logs and swallows failures. */
export async function embedUserAndIdeas(userId: string) {
  const supabase = createServiceClient();
  try {
    await embedProfile(userId);
    const { data: ideas, error } = await supabase.from("ideas").select("id").eq("owner_id", userId);
    if (error) throw new Error(error.message);
    for (const idea of ideas) await embedIdea(idea.id);
  } catch (error) {
    console.error(`Embedding failed for user ${userId}`, error);
  }
}

/** Whether the user has joined the pool. */
export async function isOnboarded(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("users")
    .select("onboarded_at")
    .eq("id", userId)
    .single();
  if (error) throw new Error(`isOnboarded: ${error.message}`);
  return data.onboarded_at !== null;
}

/** The profile row a user sees on /me. */
export async function getOwnProfile(userId: string) {
  const { data, error } = await createServiceClient()
    .from("profiles")
    .select("summary, skills, stack, domains, experience_level, user_edited, extracted_at")
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(`getOwnProfile: ${error.message}`);
  return data;
}

/** Updates the one sentence. Extraction and embedding are the caller's job. */
export async function updateSentence(userId: string, sentence: string) {
  const { error } = await createServiceClient()
    .from("users")
    .update({ raw_bio: sentence })
    .eq("id", userId);
  if (error) throw new Error(`updateSentence: ${error.message}`);
}

export async function updateName(userId: string, name: string | null) {
  const { error } = await createServiceClient().from("users").update({ name }).eq("id", userId);
  if (error) throw new Error(`updateName: ${error.message}`);
}

export async function updateRoleAndIntents(userId: string, role: Role, intents: Intent[]) {
  const { error } = await createServiceClient()
    .from("users")
    .update({ role, intents })
    .eq("id", userId);
  if (error) throw new Error(`updateRoleAndIntents: ${error.message}`);
}

export async function setPausedUntil(userId: string, pausedUntil: string | null) {
  const { error } = await createServiceClient()
    .from("users")
    .update({ paused_until: pausedUntil })
    .eq("id", userId);
  if (error) throw new Error(`setPausedUntil: ${error.message}`);
}

/** Deletes the auth user; every row of theirs cascades from it. */
export async function deleteAccount(userId: string) {
  const { error } = await createServiceClient().auth.admin.deleteUser(userId);
  if (error) throw new Error(`deleteAccount: ${error.message}`);
}

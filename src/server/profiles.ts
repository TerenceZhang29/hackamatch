import "server-only";
import { extractIdea } from "@/lib/llm/extract-idea";
import { extractProfile } from "@/lib/llm/extract-profile";
import { PROMPT_VERSION } from "@/lib/llm/prompts";
import { onboardingOutcome, type OnboardingOutcome } from "@/lib/onboarding";
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
  /** An open idea: the idea route's first idea. */
  idea: OnboardingIdea | null;
  /** A builder's sentence also described an idea, saved as a draft (P1-22). */
  draft: boolean;
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

  const { data: saved, error } = await supabase
    .from("users")
    .update(update)
    .eq("id", userId)
    .select("onboarded_at")
    .single();
  if (error) throw new Error(`saveOnboardingBasics: ${error.message}`);

  // A new sentence or route makes the earlier reading stale: until the new
  // one finishes, joining is judged as "still reading" (P1-22).
  if (!saved.onboarded_at) {
    const { error: clearError } = await supabase
      .from("profiles")
      .update({ extracted_at: null, skills: [], stack: [], domains: [], user_edited: false })
      .eq("user_id", userId);
    if (clearError) throw new Error(`saveOnboardingBasics: ${clearError.message}`);
    const { error: ideaError } = await supabase.from("ideas").delete().eq("owner_id", userId);
    if (ideaError) throw new Error(`saveOnboardingBasics: ${ideaError.message}`);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ github_summary: input.githubSummary })
    .eq("user_id", userId);
  if (profileError) throw new Error(`saveOnboardingBasics: ${profileError.message}`);
}

/**
 * Runs LLM extraction on the user's stored sentence and writes the result:
 * summary, experience level and (unless the user has edited them) tags. For
 * idea people it also creates their first idea. During sign-up
 * (`onboarding`), a builder whose sentence describes an idea gets it as a
 * private draft (P1-22); elsewhere (the Me page, imports) a builder's idea is
 * not saved. Throws `LlmError` on LLM failure, so callers can fall back to
 * running it in the background.
 *
 * Safe to run more than once while the user is still onboarding: an earlier
 * onboarding idea is replaced, not duplicated.
 */
export async function runProfileExtraction(
  userId: string,
  options: { timeoutMs?: number; onboarding?: boolean } = {},
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
  // During sign-up, skills picked while this ran (joining before it finished)
  // are kept alongside what it found.
  const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];
  const tags: ProfileTags = current.user_edited
    ? { skills: current.skills, stack: current.stack, domains: current.domains }
    : options.onboarding
      ? {
          skills: union(current.skills, extracted.skills),
          stack: union(current.stack, extracted.stack),
          domains: union(current.domains, extracted.domains),
        }
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

  // The route may have changed while the AI was reading ("Join as a builder
  // instead"), so the idea's fate follows the role as it is now.
  const { data: now, error: roleError } = await supabase
    .from("users")
    .select("role, raw_bio")
    .eq("id", userId)
    .single();
  if (roleError) throw new Error(`runProfileExtraction: ${roleError.message}`);
  // A newer sentence has replaced this one; its own run decides.
  if (now.raw_bio !== user.raw_bio) {
    return { summary: extracted.summary, tags, idea: null, draft: false };
  }
  const status = now.role === "builder" ? (options.onboarding ? "draft" : null) : "open";
  const saved = status
    ? await saveOnboardingIdea(userId, user.onboarded_at, user.raw_bio, extracted.idea, status)
    : null;
  return {
    summary: extracted.summary,
    tags,
    idea: status === "open" ? saved : null,
    draft: status === "draft" && saved !== null,
  };
}

/**
 * The stored result of the sign-up reading, for "Check again" (P1-22), or
 * null while it hasn't finished.
 */
export async function getOnboardingExtraction(userId: string): Promise<ExtractionResult | null> {
  const supabase = createServiceClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("summary, skills, stack, domains, extracted_at")
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(`getOnboardingExtraction: ${error.message}`);
  if (!profile.extracted_at) return null;
  const { data: ideas, error: ideaError } = await supabase
    .from("ideas")
    .select("id, pitch, clarifying_question, status")
    .eq("owner_id", userId)
    .in("status", ["open", "draft"]);
  if (ideaError) throw new Error(`getOnboardingExtraction: ${ideaError.message}`);
  const open = ideas.find((idea) => idea.status === "open");
  return {
    summary: profile.summary,
    tags: { skills: profile.skills, stack: profile.stack, domains: profile.domains },
    idea: open
      ? { id: open.id, pitch: open.pitch, clarifying_question: open.clarifying_question }
      : null,
    draft: ideas.some((idea) => idea.status === "draft"),
  };
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
  status: "open" | "draft",
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
      status,
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
export async function saveEditedTags(
  userId: string,
  tags: ProfileTags,
  /** False while the AI is still reading: its tags are then merged in, not blocked (P1-22). */
  markEdited = true,
): Promise<boolean> {
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
    .update({ ...normalized, user_edited: markEdited })
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

async function hasOpenIdea(userId: string): Promise<boolean> {
  const { count, error } = await createServiceClient()
    .from("ideas")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .eq("status", "open");
  if (error) throw new Error(`hasOpenIdea: ${error.message}`);
  return (count ?? 0) > 0;
}

/** Whether the sign-up reading of the user's current sentence has finished. */
export async function isExtracted(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("profiles")
    .select("extracted_at")
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(`isExtracted: ${error.message}`);
  return data.extracted_at !== null;
}

/**
 * The sign-up rule (P1-22) for a user about to join with the tags they are
 * submitting: the idea route needs an idea, the builder route a skill.
 */
export async function checkJoin(
  userId: string,
  role: Role,
  tags: ProfileTags,
): Promise<OnboardingOutcome> {
  return onboardingOutcome(role, {
    extracted: await isExtracted(userId),
    hasIdea: await hasOpenIdea(userId),
    tags: normalizeProfileTags(tags),
  });
}

export async function setRole(userId: string, role: Role) {
  const { error } = await createServiceClient().from("users").update({ role }).eq("id", userId);
  if (error) throw new Error(`setRole: ${error.message}`);
}

/** Embeds the profile and every idea of a user who is in the pool. Logs and swallows failures. */
export async function embedUserAndIdeas(userId: string) {
  const supabase = createServiceClient();
  try {
    await embedProfile(userId);
    const { data: ideas, error } = await supabase
      .from("ideas")
      .select("id")
      .eq("owner_id", userId)
      .neq("status", "draft");
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

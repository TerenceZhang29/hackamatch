import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getConfig } from "@/lib/config";
import { parseCsv } from "@/lib/csv";
import { fetchGithubSummary, parseGithubUsername } from "@/lib/imports/github";
import { normalizeLinkedinUrl } from "@/lib/imports/linkedin";
import { extractIdea } from "@/lib/llm/extract-idea";
import {
  findEvent,
  MATCH_COLUMNS,
  matchRowSchema,
  SEED_IDEA_COLUMNS,
  SIGNUP_COLUMNS,
  signupRowSchema,
  seedIdeaRowSchema,
  validateRows,
  type RowError,
} from "@/lib/phase0";
import { createServiceClient } from "@/lib/supabase/service";
import { embedIdea } from "./embed";
import { addEventInterests } from "./events";
import { createIdea } from "./ideas";
import { canonicalPair, getPairMatch } from "./matches";
import {
  embedUserAndIdeas,
  markJoinedPool,
  runProfileExtraction,
  saveOnboardingBasics,
} from "./profiles";

/**
 * Imports the Phase 0 spreadsheets (P1-16): sign-ups become onboarded users
 * with inferred profiles, seed ideas become featured ideas, and hand-made
 * matches keep their recorded answers. Idempotent: existing users, ideas and
 * pairs are skipped. Sends no email.
 */

export interface ImportInput {
  signupsCsv?: string;
  ideasCsv?: string;
  matchesCsv?: string;
  /** Owner of seed ideas whose owner_email has no account. Defaults to the first admin. */
  adminEmail?: string;
  dryRun: boolean;
  log?: (line: string) => void;
}

export interface SectionSummary {
  created: number;
  skipped: number;
  errors: RowError[];
}

export interface ImportSummary {
  signups: SectionSummary;
  ideas: SectionSummary;
  matches: SectionSummary;
  teams: number;
  /** Event names in the sheets with no matching event; create them in /admin/events and re-run. */
  unknownEvents: string[];
}

const empty = (): SectionSummary => ({ created: 0, skipped: 0, errors: [] });

async function userIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await createServiceClient()
    .from("users")
    .select("id")
    .eq("cornell_email", email)
    .maybeSingle();
  if (error) throw new Error(`userIdByEmail: ${error.message}`);
  return data?.id ?? null;
}

async function allEvents() {
  const { data, error } = await createServiceClient().from("events").select("id, slug, name");
  if (error) throw new Error(`allEvents: ${error.message}`);
  return data;
}

export async function importPhase0(input: ImportInput): Promise<ImportSummary> {
  const log = input.log ?? (() => {});
  const verb = input.dryRun ? "would create" : "created";
  const summary: ImportSummary = {
    signups: empty(),
    ideas: empty(),
    matches: empty(),
    teams: 0,
    unknownEvents: [],
  };
  const events = await allEvents();
  const unknown = new Set<string>();
  const resolveEvent = (cell: string | null) => {
    if (!cell) return null;
    const event = findEvent(events, cell);
    if (!event) unknown.add(cell);
    return event;
  };
  const supabase = createServiceClient();

  // --- Sign-ups ---------------------------------------------------------------
  if (input.signupsCsv) {
    const { valid, errors } = validateRows(
      parseCsv(input.signupsCsv, SIGNUP_COLUMNS),
      signupRowSchema,
    );
    summary.signups.errors.push(...errors);
    for (const { line, row } of valid) {
      if (await userIdByEmail(row.email)) {
        summary.signups.skipped++;
        continue;
      }
      const eventIds = row.events
        .map(resolveEvent)
        .filter((e) => e !== null)
        .map((e) => e.id);
      log(`signups line ${line}: ${verb} ${row.email} (${row.role})`);
      if (input.dryRun) {
        summary.signups.created++;
        continue;
      }

      const { data: created, error } = await supabase.auth.admin.createUser({
        email: row.email,
        email_confirm: true,
        user_metadata: row.name ? { name: row.name } : {},
      });
      if (error || !created.user) {
        summary.signups.errors.push({ line, message: `could not create user: ${error?.message}` });
        continue;
      }
      const userId = created.user.id;
      const github =
        row.github_url && parseGithubUsername(row.github_url)
          ? await fetchGithubSummary(row.github_url, { token: getConfig().GITHUB_TOKEN })
          : null;
      await saveOnboardingBasics(userId, {
        name: row.name,
        role: row.role,
        sentence: row.sentence,
        githubUrl: github ? `https://github.com/${github.username}` : null,
        githubSummary: github?.summaryText || null,
        linkedinUrl: row.linkedin_url ? normalizeLinkedinUrl(row.linkedin_url) : null,
        linkedinText: null,
      });
      await supabase
        .from("users")
        .update({ onboarding_started_at: new Date().toISOString() })
        .eq("id", userId);
      try {
        await runProfileExtraction(userId, { timeoutMs: 30_000 });
      } catch (extractionError) {
        log(
          `signups line ${line}: tags not inferred (${String(extractionError)}); the user can add them`,
        );
      }
      await addEventInterests(userId, eventIds);
      await markJoinedPool(userId);
      await embedUserAndIdeas(userId);
      summary.signups.created++;
    }
  }

  // --- Seed ideas --------------------------------------------------------------
  if (input.ideasCsv) {
    const { valid, errors } = validateRows(
      parseCsv(input.ideasCsv, SEED_IDEA_COLUMNS),
      seedIdeaRowSchema,
    );
    summary.ideas.errors.push(...errors);
    const fallbackOwner = input.adminEmail
      ? await userIdByEmail(input.adminEmail.toLowerCase())
      : ((
          await supabase
            .from("users")
            .select("id")
            .eq("is_admin", true)
            .order("created_at")
            .limit(1)
        ).data?.[0]?.id ?? null);

    for (const { line, row } of valid) {
      const ownerId = (await userIdByEmail(row.owner_email)) ?? fallbackOwner;
      if (!ownerId) {
        summary.ideas.errors.push({
          line,
          message: `no account for ${row.owner_email} and no admin`,
        });
        continue;
      }
      const { data: existing } = await supabase
        .from("ideas")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("raw_text", row.sentence)
        .limit(1);
      if (existing?.length) {
        summary.ideas.skipped++;
        continue;
      }
      const event = resolveEvent(row.event);
      log(`ideas line ${line}: ${verb} featured idea "${row.sentence.slice(0, 50)}"`);
      if (input.dryRun) {
        summary.ideas.created++;
        continue;
      }
      let extracted: Awaited<ReturnType<typeof extractIdea>> | null = null;
      try {
        extracted = await extractIdea({ text: row.sentence }, { timeoutMs: 30_000 });
      } catch (extractionError) {
        log(`ideas line ${line}: pitch not written (${String(extractionError)})`);
      }
      const ideaId = await createIdea(ownerId, {
        rawText: row.sentence,
        eventId: event?.id ?? null,
        pitch: extracted?.pitch ?? null,
        domain: extracted?.domain ?? null,
        skillsNeeded: extracted?.skills_needed ?? [],
        scope: extracted?.scope ?? null,
        clarifyingQuestion: extracted?.clarifying_question ?? null,
      });
      await supabase.from("ideas").update({ featured: true }).eq("id", ideaId);
      try {
        await embedIdea(ideaId);
      } catch (embedError) {
        log(`ideas line ${line}: not embedded (${String(embedError)})`);
      }
      summary.ideas.created++;
    }
  }

  // --- Hand-made matches ---------------------------------------------------------
  if (input.matchesCsv) {
    const { valid, errors } = validateRows(
      parseCsv(input.matchesCsv, MATCH_COLUMNS),
      matchRowSchema,
    );
    summary.matches.errors.push(...errors);
    for (const { line, row } of valid) {
      const [x, y] = await Promise.all([userIdByEmail(row.email_a), userIdByEmail(row.email_b)]);
      if (!x || !y) {
        summary.matches.errors.push({
          line,
          message: `no account for ${!x ? row.email_a : row.email_b} (import sign-ups first)`,
        });
        continue;
      }
      if (await getPairMatch(x, y)) {
        summary.matches.skipped++;
        continue;
      }
      const event = resolveEvent(row.event);
      const both = row.a_response === "interested" && row.b_response === "interested";
      log(
        `matches line ${line}: ${verb} ${row.email_a} + ${row.email_b}${both ? " (mutual)" : ""}`,
      );
      if (input.dryRun) {
        summary.matches.created++;
        if (row.teamed_up && both) summary.teams++;
        continue;
      }

      let ideaId: string | null = null;
      if (row.idea_sentence) {
        const { data: ideas } = await supabase
          .from("ideas")
          .select("id, raw_text")
          .in("owner_id", [x, y]);
        const wanted = row.idea_sentence.trim().toLowerCase();
        ideaId = ideas?.find((i) => i.raw_text.trim().toLowerCase() === wanted)?.id ?? null;
      }
      // Answers are recorded in the sheet's A/B order; the table stores the pair sorted.
      const [a] = canonicalPair(x, y);
      const answerA = a === x ? row.a_response : row.b_response;
      const answerB = a === x ? row.b_response : row.a_response;
      const now = new Date().toISOString();
      const { data: match, error } = await supabase
        .from("matches")
        .insert({
          user_a: a,
          user_b: a === x ? y : x,
          idea_id: ideaId,
          event_id: event?.id ?? null,
          source: "admin",
          reason_for_a: row.reason,
          reason_for_b: row.reason,
          a_response: answerA,
          b_response: answerB,
          a_responded_at: answerA === "pending" ? null : now,
          b_responded_at: answerB === "pending" ? null : now,
          revealed_at: both ? now : null,
        })
        .select("id")
        .single();
      if (error) {
        summary.matches.errors.push({ line, message: error.message });
        continue;
      }
      summary.matches.created++;

      if (row.teamed_up && !both) {
        log(`matches line ${line}: marked teamed up but not mutual; no team created`);
      } else if (row.teamed_up) {
        const { error: teamError } = await supabase.rpc("team_up", {
          p_match: match.id,
          p_event: (event?.id ?? null) as string,
          p_actor: x,
        });
        if (teamError) summary.matches.errors.push({ line, message: `team: ${teamError.message}` });
        else summary.teams++;
      }
    }
  }

  summary.unknownEvents = [...unknown];
  return summary;
}

/**
 * Emails each listed user a sign-in link so they can claim their imported
 * profile. Uses Supabase Auth's magic-link email (one per address per second).
 * Skips addresses with no account; never creates one.
 */
export async function sendWelcomeLinks(
  emails: string[],
  log: (line: string) => void = () => {},
): Promise<{ sent: number; skipped: number; failed: number }> {
  const config = getConfig();
  const anon = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const confirm = new URL("/auth/confirm", config.APP_URL);
  // Imported users are already in the pool; send them to their profile to check it.
  confirm.searchParams.set("next", "/me");
  const result = { sent: 0, skipped: 0, failed: 0 };

  for (const email of emails) {
    if (!(await userIdByEmail(email))) {
      result.skipped++;
      continue;
    }
    const { error } = await anon.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: confirm.toString(), shouldCreateUser: false },
    });
    if (error) {
      result.failed++;
      log(`welcome: ${email} failed (${error.message})`);
    } else {
      result.sent++;
      log(`welcome: sent to ${email}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_100));
  }
  return result;
}

import "server-only";
import { slugify } from "@/lib/slug";
import { createServiceClient } from "@/lib/supabase/service";
import type { Enums, Tables } from "@/types/db";
import { canonicalPair, getPairMatch, sendInboundInterest } from "./matches";

/** Reads and writes behind /admin. Callers must have checked `requireAdmin()`. */

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: Enums<"user_role"> | null;
  intents: Enums<"user_intent">[];
  isAdmin: boolean;
  isOrganizer: boolean;
  isDemo: boolean;
  onboardedAt: string | null;
  pausedUntil: string | null;
  lastActiveAt: string;
  matches: number;
  mutual: number;
}

export async function listUsers(search: string | null): Promise<AdminUserRow[]> {
  const supabase = createServiceClient();
  let query = supabase
    .from("users")
    .select(
      "id, cornell_email, name, role, intents, is_admin, is_organizer, is_demo, onboarded_at, paused_until, last_active_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (search) {
    const term = search.replaceAll(/[%,()]/g, " ").trim();
    query = query.or(`cornell_email.ilike.%${term}%,name.ilike.%${term}%`);
  }
  const { data: users, error } = await query;
  if (error) throw new Error(`listUsers: ${error.message}`);

  const { data: matches, error: matchError } = await supabase
    .from("matches")
    .select("user_a, user_b, revealed_at");
  if (matchError) throw new Error(`listUsers: ${matchError.message}`);
  const counts = new Map<string, { matches: number; mutual: number }>();
  for (const match of matches) {
    for (const id of [match.user_a, match.user_b]) {
      const entry = counts.get(id) ?? { matches: 0, mutual: 0 };
      entry.matches += 1;
      if (match.revealed_at) entry.mutual += 1;
      counts.set(id, entry);
    }
  }

  return users.map((u) => ({
    id: u.id,
    email: u.cornell_email,
    name: u.name,
    role: u.role,
    intents: u.intents,
    isAdmin: u.is_admin,
    isOrganizer: u.is_organizer,
    isDemo: u.is_demo,
    onboardedAt: u.onboarded_at,
    pausedUntil: u.paused_until,
    lastActiveAt: u.last_active_at,
    ...(counts.get(u.id) ?? { matches: 0, mutual: 0 }),
  }));
}

export async function setOrganizer(userId: string, isOrganizer: boolean) {
  const { error } = await createServiceClient()
    .from("users")
    .update({ is_organizer: isOrganizer })
    .eq("id", userId);
  if (error) throw new Error(`setOrganizer: ${error.message}`);
}

export interface AdminIdeaRow {
  id: string;
  pitch: string | null;
  rawText: string;
  status: Enums<"idea_status">;
  featured: boolean;
  ownerEmail: string;
  createdAt: string;
}

export async function listIdeas(): Promise<AdminIdeaRow[]> {
  const { data, error } = await createServiceClient()
    .from("ideas")
    .select(
      "id, pitch, raw_text, status, featured, created_at, owner:users!ideas_owner_id_fkey(cornell_email)",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`listIdeas: ${error.message}`);
  return data.map((idea) => ({
    id: idea.id,
    pitch: idea.pitch,
    rawText: idea.raw_text,
    status: idea.status,
    featured: idea.featured,
    ownerEmail: idea.owner?.cornell_email ?? "",
    createdAt: idea.created_at,
  }));
}

export type AdminEvent = Tables<"events">;

export async function listEvents(): Promise<AdminEvent[]> {
  const { data, error } = await createServiceClient()
    .from("events")
    .select("*")
    .order("start_date", { ascending: false });
  if (error) throw new Error(`listEvents: ${error.message}`);
  return data;
}

export async function getEvent(eventId: string): Promise<AdminEvent | null> {
  const { data, error } = await createServiceClient()
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(`getEvent: ${error.message}`);
  return data;
}

/** The first of `base`, `base-2`, `base-3`, … that no other event uses. */
async function uniqueSlug(base: string, ignoreEventId: string | null): Promise<string> {
  const { data, error } = await createServiceClient()
    .from("events")
    .select("id, slug")
    .like("slug", `${base}%`);
  if (error) throw new Error(`uniqueSlug: ${error.message}`);
  const taken = new Set(data.filter((e) => e.id !== ignoreEventId).map((e) => e.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export interface EventInput {
  name: string;
  description: string | null;
  url: string | null;
  startDate: string;
  endDate: string;
  teamSizeMin: number;
  teamSizeMax: number;
  /** Any address; the organizer doesn't need an account. */
  organizerEmail: string | null;
  /** Their account, when one with that email exists. */
  organizerId: string | null;
  /** Shown on the event page (P1-24). */
  timeLabel: string | null;
  venue: string | null;
  host: string | null;
  domains: string[];
}

/** Creates an event, or updates one when `eventId` is given. Returns its id and slug. */
export async function saveEvent(
  input: EventInput,
  eventId: string | null = null,
): Promise<{ id: string; slug: string }> {
  const supabase = createServiceClient();
  const row = {
    name: input.name,
    description: input.description,
    url: input.url,
    start_date: input.startDate,
    end_date: input.endDate,
    team_size_min: input.teamSizeMin,
    team_size_max: input.teamSizeMax,
    organizer_email: input.organizerEmail,
    organizer_id: input.organizerId,
    time_label: input.timeLabel,
    venue: input.venue,
    host: input.host,
    domains: input.domains,
  };
  if (eventId) {
    // The slug is the shareable link, so renaming an event keeps it.
    const { data, error } = await supabase
      .from("events")
      .update(row)
      .eq("id", eventId)
      .select("id, slug")
      .single();
    if (error) throw new Error(`saveEvent: ${error.message}`);
    return data;
  }
  const slug = await uniqueSlug(slugify(input.name), null);
  const { data, error } = await supabase
    .from("events")
    .insert({ ...row, slug })
    .select("id, slug")
    .single();
  if (error) throw new Error(`saveEvent: ${error.message}`);
  return data;
}

/** Users who can be picked when making a match by hand: onboarded and not paused. */
export async function listMatchableUsers() {
  const { data, error } = await createServiceClient()
    .from("users")
    .select("id, cornell_email, name, role")
    .not("onboarded_at", "is", null)
    .order("cornell_email");
  if (error) throw new Error(`listMatchableUsers: ${error.message}`);
  return data;
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await createServiceClient()
    .from("users")
    .select("id")
    .eq("cornell_email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`findUserIdByEmail: ${error.message}`);
  return data?.id ?? null;
}

export type AdminMatchResult = { ok: true; matchId: string } | { ok: false; error: string };

/**
 * A match made by hand (the Phase 0 loop inside the product). Both people get
 * a "we think you should meet" email with their own reason line and
 * one-click Interested / Pass links.
 */
export async function createAdminMatch(input: {
  userX: string;
  userY: string;
  ideaId: string | null;
  eventId: string | null;
  reasonForX: string | null;
  reasonForY: string | null;
}): Promise<AdminMatchResult> {
  if (input.userX === input.userY) return { ok: false, error: "Pick two different people." };
  if (await getPairMatch(input.userX, input.userY)) {
    return { ok: false, error: "These two already have a match." };
  }
  const [a, b] = canonicalPair(input.userX, input.userY);
  const xIsA = a === input.userX;
  const { data: match, error } = await createServiceClient()
    .from("matches")
    .insert({
      user_a: a,
      user_b: b,
      idea_id: input.ideaId,
      event_id: input.eventId,
      source: "admin",
      reason_for_a: xIsA ? input.reasonForX : input.reasonForY,
      reason_for_b: xIsA ? input.reasonForY : input.reasonForX,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createAdminMatch: ${error.message}`);

  await sendInboundInterest(match, match.user_a, "intro", match.reason_for_a);
  await sendInboundInterest(match, match.user_b, "intro", match.reason_for_b);
  return { ok: true, matchId: match.id };
}

export interface AdminMatchRow {
  id: string;
  source: Enums<"match_source">;
  aEmail: string;
  bEmail: string;
  aResponse: Enums<"match_response">;
  bResponse: Enums<"match_response">;
  revealedAt: string | null;
  teamedUpAt: string | null;
  createdAt: string;
}

export async function listAllMatches(): Promise<AdminMatchRow[]> {
  const { data, error } = await createServiceClient()
    .from("matches")
    .select(
      "id, source, a_response, b_response, revealed_at, teamed_up_at, created_at, a:users!matches_user_a_fkey(cornell_email), b:users!matches_user_b_fkey(cornell_email)",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`listAllMatches: ${error.message}`);
  return data.map((m) => ({
    id: m.id,
    source: m.source,
    aEmail: m.a?.cornell_email ?? "",
    bEmail: m.b?.cornell_email ?? "",
    aResponse: m.a_response,
    bResponse: m.b_response,
    revealedAt: m.revealed_at,
    teamedUpAt: m.teamed_up_at,
    createdAt: m.created_at,
  }));
}

/** Headline numbers for the admin home page. */
export async function adminCounts() {
  const supabase = createServiceClient();
  const count = async (table: "users" | "ideas" | "events" | "matches" | "teams") => {
    const { count: n, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`adminCounts: ${error.message}`);
    return n ?? 0;
  };
  // Real people only: demo profiles (docs/plans/demo-profiles.md) are counted apart.
  const realUsers = async (demo: boolean) => {
    const { count: n, error } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("is_demo", demo);
    if (error) throw new Error(`adminCounts: ${error.message}`);
    return n ?? 0;
  };
  const realIdeas = async () => {
    const { count: n, error } = await supabase
      .from("ideas")
      .select("id, users!inner(is_demo)", { count: "exact", head: true })
      .eq("users.is_demo", false)
      // Drafts are private until posted (P1-22).
      .neq("status", "draft");
    if (error) throw new Error(`adminCounts: ${error.message}`);
    return n ?? 0;
  };
  const [users, ideas, events, matches, teams, demo] = await Promise.all([
    realUsers(false),
    realIdeas(),
    count("events"),
    count("matches"),
    count("teams"),
    realUsers(true),
  ]);
  return { users, ideas, events, matches, teams, demo };
}

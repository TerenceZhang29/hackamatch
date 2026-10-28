import "server-only";
import { after } from "next/server";
import { addCardPass } from "./card-passes";
import { createElement } from "react";
import { track } from "@/lib/analytics";
import { getConfig } from "@/lib/config";
import { writeCoffeeChat } from "@/lib/llm/coffee-chat";
import { pauseUrl, responseUrl, send } from "@/server/notify";
import {
  InboundInterest,
  inboundInterestSubject,
  type InboundInterestProps,
} from "@/lib/notify/templates/InboundInterest";
import { Mutual, mutualSubject } from "@/lib/notify/templates/Mutual";
import { createServiceClient } from "@/lib/supabase/service";
import { localDateString } from "@/lib/time";
import type { Enums, Tables } from "@/types/db";

/**
 * Match lifecycle: responses, the mutual reveal, and the emails around them.
 * Service client: callers must have authorized the acting user (a session or a
 * verified one-click token) before calling.
 */

export type Match = Tables<"matches">;
export type MatchResponse = Exclude<Enums<"match_response">, "pending">;

/** Orders two user ids the way the matches table requires (user_a < user_b). */
export function canonicalPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

/** Which side of the match a user is on, or null when they are not in it. */
export function sideOf(match: Pick<Match, "user_a" | "user_b">, userId: string): "a" | "b" | null {
  if (match.user_a === userId) return "a";
  if (match.user_b === userId) return "b";
  return null;
}

export function otherUserId(match: Pick<Match, "user_a" | "user_b">, userId: string): string {
  return match.user_a === userId ? match.user_b : match.user_a;
}

export async function getMatch(matchId: string): Promise<Match | null> {
  const { data, error } = await createServiceClient()
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle();
  if (error) throw new Error(`getMatch: ${error.message}`);
  return data;
}

/**
 * Records a user's answer on a match (answers can be changed) and reveals the
 * match if both are now interested. Returns null when the user is not in the
 * match.
 */
export async function recordResponse(
  matchId: string,
  userId: string,
  response: MatchResponse,
): Promise<{ match: Match; revealedNow: boolean } | null> {
  const match = await getMatch(matchId);
  const side = match ? sideOf(match, userId) : null;
  if (!match || !side) return null;

  const now = new Date().toISOString();
  const update =
    side === "a"
      ? { a_response: response, a_responded_at: now }
      : { b_response: response, b_responded_at: now };
  const { data: updated, error } = await createServiceClient()
    .from("matches")
    .update(update)
    .eq("id", matchId)
    .select("*")
    .single();
  if (error) throw new Error(`recordResponse: ${error.message}`);

  await track(
    response === "interested" ? "interest_expressed" : "passed",
    { match_id: matchId, source: match.source },
    userId,
  );

  const revealed = response === "interested" ? await revealIfMutual(matchId) : null;
  return { match: revealed ?? updated, revealedNow: revealed !== null };
}

/**
 * Sets `revealed_at` if both sides are interested and it is not set yet, in
 * one conditional UPDATE, so two simultaneous "interested" clicks reveal (and
 * email) exactly once. Returns the match when this call revealed it.
 */
export async function revealIfMutual(matchId: string): Promise<Match | null> {
  const { data, error } = await createServiceClient()
    .from("matches")
    .update({ revealed_at: new Date().toISOString() })
    .eq("id", matchId)
    .is("revealed_at", null)
    .eq("a_response", "interested")
    .eq("b_response", "interested")
    .select("*");
  if (error) throw new Error(`revealIfMutual: ${error.message}`);
  const match = data[0];
  if (!match) return null;

  // After the response, so the answer doesn't wait on the emails (and their AI intro).
  after(async () => {
    await track("mutual_match", { match_id: matchId, source: match.source });
    await sendMutualEmails(match);
  });
  return match;
}

interface Person {
  id: string;
  name: string;
  email: string;
  summary: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
}

/** The first name we address someone by; falls back to their netid. */
export function firstName(name: string | null, email: string): string {
  return name?.trim().split(/\s+/)[0] || email.split("@")[0]!;
}

async function loadPeople(ids: string[]): Promise<Map<string, Person>> {
  const supabase = createServiceClient();
  const [{ data: users, error }, { data: profiles, error: profileError }] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, cornell_email, github_url, linkedin_url")
      .in("id", ids),
    supabase.from("profiles").select("user_id, summary").in("user_id", ids),
  ]);
  if (error) throw new Error(`loadPeople: ${error.message}`);
  if (profileError) throw new Error(`loadPeople: ${profileError.message}`);
  const summaries = new Map(profiles.map((p) => [p.user_id, p.summary]));
  return new Map(
    users.map((u) => [
      u.id,
      {
        id: u.id,
        name: firstName(u.name, u.cornell_email),
        email: u.cornell_email,
        summary: summaries.get(u.id) ?? null,
        githubUrl: u.github_url,
        linkedinUrl: u.linkedin_url,
      },
    ]),
  );
}

/** Whether a user is a demo profile. */
async function isDemoUser(userId: string): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("users")
    .select("is_demo")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`isDemoUser: ${error.message}`);
  return data?.is_demo ?? false;
}

/** Whether either person in a match is a demo profile (docs/plans/demo-profiles.md). */
export async function involvesDemo(match: Pick<Match, "user_a" | "user_b">): Promise<boolean> {
  const { data, error } = await createServiceClient()
    .from("users")
    .select("id")
    .in("id", [match.user_a, match.user_b])
    .eq("is_demo", true);
  if (error) throw new Error(`involvesDemo: ${error.message}`);
  return data.length > 0;
}

/** Emails both people their match's contact details and a suggested first message. */
async function sendMutualEmails(match: Match) {
  // No email (and no AI-written message) for anything involving a demo profile.
  if (await involvesDemo(match)) return;
  const people = await loadPeople([match.user_a, match.user_b]);
  // Ideas are gone from the app (P1-24): emails never name one.
  const pitch = null;
  const matchUrl = new URL(`/matches/${match.id}`, getConfig().APP_URL).toString();

  for (const [recipientId, otherId] of [
    [match.user_a, match.user_b],
    [match.user_b, match.user_a],
  ] as const) {
    const recipient = people.get(recipientId);
    const other = people.get(otherId);
    if (!recipient || !other) continue;
    const coffeeChat = await writeCoffeeChat({
      senderName: recipient.name,
      recipientName: other.name,
      ideaPitch: pitch,
      recipientSummary: other.summary,
    });
    const props = {
      other,
      ideaPitch: pitch,
      coffeeChat,
      matchUrl,
      pauseUrl: pauseUrl(recipientId),
    };
    await send({
      userId: recipientId,
      kind: "mutual",
      subject: mutualSubject(props),
      email: createElement(Mutual, props),
      payload: { match_id: match.id },
    });
  }
}

/**
 * Tells `recipientId` that someone is interested (or, for admin-made matches,
 * that we suggest they meet), with one-click Interested / Pass links.
 */
export async function sendInboundInterest(
  match: Match,
  recipientId: string,
  variant: InboundInterestProps["variant"],
  reason: string | null = null,
) {
  if (await involvesDemo(match)) return "skipped" as const;
  const otherId = otherUserId(match, recipientId);
  const people = await loadPeople([otherId]);
  const other = people.get(otherId);
  if (!other) return "failed" as const;

  const props: InboundInterestProps = {
    variant,
    otherName: other.name,
    otherSummary: other.summary,
    // Ideas are gone from the app (P1-24): emails never name one.
    ideaPitch: null,
    reason,
    interestedUrl: responseUrl(match.id, recipientId, "interested"),
    passUrl: responseUrl(match.id, recipientId, "pass"),
    pauseUrl: pauseUrl(recipientId),
  };
  return send({
    userId: recipientId,
    kind: "inbound_interest",
    subject: inboundInterestSubject(props),
    email: createElement(InboundInterest, props),
    payload: { match_id: match.id, variant },
  });
}

/** Max people one user can say Interested to per local day (P1-11). */
export const DAILY_INTEREST_LIMIT = 15;
/** Max "someone is interested" emails one user receives per local day; the rest wait on /matches. */
export const DAILY_INBOUND_EMAIL_LIMIT = 3;

export type BoardTarget = { kind: "person"; userId: string } | { kind: "idea"; ideaId: string };

export type BoardAnswerResult =
  | { ok: true; response: "interested"; matchId: string; revealed: boolean }
  /** A Pass hides only that card (P1-23); there is no match row to point at. */
  | { ok: true; response: "pass" }
  | { ok: false; error: "limit" | "unavailable" | "self" };

/** Resolves a board card to the person behind it, if they are in the pool and the idea is open. */
async function resolveTarget(
  target: BoardTarget,
): Promise<{ userId: string; ideaId: string | null } | null> {
  const supabase = createServiceClient();
  let userId: string;
  let ideaId: string | null = null;
  if (target.kind === "idea") {
    const { data: idea } = await supabase
      .from("ideas")
      .select("owner_id, status")
      .eq("id", target.ideaId)
      .maybeSingle();
    if (!idea || idea.status !== "open") return null;
    userId = idea.owner_id;
    ideaId = target.ideaId;
  } else {
    userId = target.userId;
  }
  const { data: user } = await supabase
    .from("users")
    .select("onboarded_at, paused_until")
    .eq("id", userId)
    .maybeSingle();
  const paused = user?.paused_until && new Date(user.paused_until).getTime() > Date.now();
  if (!user?.onboarded_at || paused) return null;
  return { userId, ideaId };
}

/** How many "someone is interested" emails a user has been sent today. */
async function inboundEmailsToday(userId: string): Promise<number> {
  const { count, error } = await createServiceClient()
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "inbound_interest")
    .eq("status", "sent")
    .eq("local_date", localDateString(getConfig().APP_TIMEZONE));
  if (error) throw new Error(`inboundEmailsToday: ${error.message}`);
  return count ?? 0;
}

/**
 * Interested or Pass on a board card (a person, or an idea's owner). Creates
 * the pair's match or updates only the actor's side, atomically. A first
 * "interested" emails the other person (up to the daily email cap); a second
 * one reveals the match.
 */
export async function answerFromBoard(
  actorId: string,
  target: BoardTarget,
  response: MatchResponse,
): Promise<BoardAnswerResult> {
  const supabase = createServiceClient();
  const resolved = await resolveTarget(target);
  if (!resolved) return { ok: false, error: "unavailable" };
  if (resolved.userId === actorId) return { ok: false, error: "self" };

  // Pass on a card hides that card only: the person's other cards stay, and
  // nothing is recorded on the pair (P1-23). Waiting and one-click Pass,
  // which decline someone, go through recordResponse instead.
  if (response === "pass") {
    await addCardPass(actorId, target.kind, target.kind === "idea" ? target.ideaId : target.userId);
    after(() => track("passed", { kind: target.kind, source: "board" }, actorId));
    return { ok: true, response: "pass" };
  }

  {
    const { data: count, error } = await supabase.rpc("interests_today", {
      p_user: actorId,
      p_timezone: getConfig().APP_TIMEZONE,
    });
    if (error) throw new Error(`answerFromBoard: ${error.message}`);
    if (count >= DAILY_INTEREST_LIMIT) return { ok: false, error: "limit" };
  }

  const { data, error } = await supabase.rpc("respond_to_pair", {
    p_actor: actorId,
    p_target: resolved.userId,
    // Generated types mark every argument non-null; SQL accepts null for "no idea".
    p_idea: resolved.ideaId as string,
    p_response: "interested",
    p_source: "board",
  });
  if (error) throw new Error(`answerFromBoard: ${error.message}`);
  const row = data[0];
  if (!row) throw new Error("answerFromBoard: no match returned");

  after(() => track("interest_expressed", { match_id: row.match_id, source: "board" }, actorId));

  // Demo profiles answer Interested straight away, so testers can try the
  // whole flow; involvesDemo keeps every email of this match from going out.
  if (await isDemoUser(resolved.userId)) {
    const { error: demoError } = await supabase.rpc("respond_to_pair", {
      p_actor: resolved.userId,
      p_target: actorId,
      p_idea: resolved.ideaId as string,
      p_response: "interested",
      p_source: "board",
    });
    if (demoError) throw new Error(`answerFromBoard: ${demoError.message}`);
  }

  const revealed = await revealIfMutual(row.match_id);
  if (revealed) return { ok: true, response: "interested", matchId: row.match_id, revealed: true };

  // The other side hasn't answered yet: tell them, unless they've had enough
  // email today. After the response, so the answer doesn't wait on the email.
  after(async () => {
    const match = await getMatch(row.match_id);
    const otherId = resolved.userId;
    const otherSide = match ? sideOf(match, otherId) : null;
    const otherAnswer = match && otherSide ? match[`${otherSide}_response`] : null;
    if (
      match &&
      otherAnswer === "pending" &&
      (await inboundEmailsToday(otherId)) < DAILY_INBOUND_EMAIL_LIMIT
    ) {
      await sendInboundInterest(match, otherId, "interest");
    }
  });
  return { ok: true, response: "interested", matchId: row.match_id, revealed: false };
}

/** The match between two users, if any. */
export async function getPairMatch(x: string, y: string): Promise<Match | null> {
  const [a, b] = canonicalPair(x, y);
  const { data, error } = await createServiceClient()
    .from("matches")
    .select("*")
    .eq("user_a", a)
    .eq("user_b", b)
    .maybeSingle();
  if (error) throw new Error(`getPairMatch: ${error.message}`);
  return data;
}

export type MatchSection = "waiting" | "mutual" | "sent";

export interface MatchListItem {
  id: string;
  section: MatchSection;
  otherId: string;
  otherName: string;
  otherSummary: string | null;
  otherTags: string[];
  ideaPitch: string | null;
  ideaIsMine: boolean;
  reason: string | null;
  isNew: boolean;
  createdAt: string;
}

const NEW_FOR_MS = 24 * 60 * 60 * 1000;

/**
 * A user's matches, grouped for /matches. Matches they passed on are left
 * out. The other person's answer is never part of the result unless the match
 * is revealed (when it is "interested" by definition).
 */
export async function listMatchesForUser(userId: string): Promise<MatchListItem[]> {
  const supabase = createServiceClient();
  const { data: matches, error } = await supabase
    .from("matches")
    .select("*")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listMatchesForUser: ${error.message}`);

  const visible = matches.filter((m) => {
    const mine = sideOf(m, userId) === "a" ? m.a_response : m.b_response;
    return m.revealed_at !== null || mine !== "pass";
  });
  if (visible.length === 0) return [];

  const otherIds = [...new Set(visible.map((m) => otherUserId(m, userId)))];
  const ideaIds = [...new Set(visible.map((m) => m.idea_id).filter((id): id is string => !!id))];
  const [{ data: users }, { data: profiles }, { data: ideas }] = await Promise.all([
    supabase.from("users").select("id, name").in("id", otherIds),
    supabase.from("profiles").select("user_id, summary, skills, stack").in("user_id", otherIds),
    ideaIds.length
      ? supabase.from("ideas").select("id, pitch, owner_id").in("id", ideaIds)
      : Promise.resolve({ data: [] as { id: string; pitch: string | null; owner_id: string }[] }),
  ]);
  const names = new Map((users ?? []).map((u) => [u.id, u.name]));
  const profileById = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const ideaById = new Map((ideas ?? []).map((i) => [i.id, i]));
  const { displayName } = await import("@/lib/display-name");

  return visible.map((m) => {
    const side = sideOf(m, userId)!;
    const mine = side === "a" ? m.a_response : m.b_response;
    const otherId = otherUserId(m, userId);
    const profile = profileById.get(otherId);
    const idea = m.idea_id ? ideaById.get(m.idea_id) : undefined;
    const section: MatchSection = m.revealed_at
      ? "mutual"
      : mine === "pending"
        ? "waiting"
        : "sent";
    return {
      id: m.id,
      section,
      otherId,
      otherName: displayName(names.get(otherId)),
      otherSummary: profile?.summary ?? null,
      otherTags: [...(profile?.stack ?? []), ...(profile?.skills ?? [])].slice(0, 6),
      ideaPitch: idea?.pitch ?? null,
      ideaIsMine: idea?.owner_id === userId,
      reason: side === "a" ? m.reason_for_a : m.reason_for_b,
      isNew: section === "waiting" && Date.now() - new Date(m.created_at).getTime() < NEW_FOR_MS,
      createdAt: m.created_at,
    };
  });
}

/** The other person's first name on a revealed match the viewer is in, for "You matched with …". */
export async function matchedFirstName(matchId: string, viewerId: string): Promise<string | null> {
  const match = await getMatch(matchId);
  if (!match?.revealed_at || !sideOf(match, viewerId)) return null;
  const { data, error } = await createServiceClient()
    .from("users")
    .select("name, cornell_email")
    .eq("id", otherUserId(match, viewerId))
    .maybeSingle();
  if (error) throw new Error(`matchedFirstName: ${error.message}`);
  return data ? firstName(data.name, data.cornell_email) : null;
}

/**
 * Undoes the viewer's Pass on a match, from the deck's "Undo". Only a Pass on
 * a match that isn't revealed can be undone. Nobody is told about a Pass, so
 * undoing it has no other effects: a match that exists only because of this
 * Pass (from the board, other side still pending) is deleted; otherwise the
 * viewer's answer goes back to pending.
 */
export async function undoPass(matchId: string, viewerId: string): Promise<boolean> {
  const match = await getMatch(matchId);
  const side = match ? sideOf(match, viewerId) : null;
  if (!match || !side || match.revealed_at) return false;
  if (match[`${side}_response`] !== "pass") return false;
  const other = side === "a" ? match.b_response : match.a_response;
  const supabase = createServiceClient();
  const { error } =
    match.source === "board" && other === "pending"
      ? await supabase.from("matches").delete().eq("id", matchId)
      : await supabase
          .from("matches")
          .update(
            side === "a"
              ? { a_response: "pending", a_responded_at: null }
              : { b_response: "pending", b_responded_at: null },
          )
          .eq("id", matchId);
  if (error) throw new Error(`undoPass: ${error.message}`);
  return true;
}

/** How many matches are waiting on the user's answer (for the Matches tab's badge). */
export async function countWaiting(userId: string): Promise<number> {
  const supabase = createServiceClient();
  const [a, b] = await Promise.all([
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("user_a", userId)
      .eq("a_response", "pending")
      .is("revealed_at", null),
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("user_b", userId)
      .eq("b_response", "pending")
      .is("revealed_at", null),
  ]);
  if (a.error || b.error) throw new Error(`countWaiting: ${(a.error ?? b.error)!.message}`);
  return (a.count ?? 0) + (b.count ?? 0);
}

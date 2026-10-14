import "server-only";
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

  await track("mutual_match", { match_id: matchId, source: match.source });
  await sendMutualEmails(match);
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

async function ideaPitch(ideaId: string | null): Promise<string | null> {
  if (!ideaId) return null;
  const { data } = await createServiceClient()
    .from("ideas")
    .select("pitch")
    .eq("id", ideaId)
    .maybeSingle();
  return data?.pitch ?? null;
}

/** Emails both people their match's contact details and a suggested first message. */
async function sendMutualEmails(match: Match) {
  const people = await loadPeople([match.user_a, match.user_b]);
  const pitch = await ideaPitch(match.idea_id);
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
  const otherId = otherUserId(match, recipientId);
  const people = await loadPeople([otherId]);
  const other = people.get(otherId);
  if (!other) return "failed" as const;

  // Only show the idea pitch when the idea is the recipient's own.
  const { data: idea } = match.idea_id
    ? await createServiceClient()
        .from("ideas")
        .select("pitch, owner_id")
        .eq("id", match.idea_id)
        .maybeSingle()
    : { data: null };

  const props: InboundInterestProps = {
    variant,
    otherName: other.name,
    otherSummary: other.summary,
    ideaPitch: idea && idea.owner_id === recipientId ? idea.pitch : null,
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

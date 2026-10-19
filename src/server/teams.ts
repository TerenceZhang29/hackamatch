import "server-only";
import { track } from "@/lib/analytics";
import { getConfig } from "@/lib/config";
import { coffeeChatTemplate } from "@/lib/llm/coffee-chat";
import { createServiceClient } from "@/lib/supabase/service";
import { localDateString } from "@/lib/time";
import { markGoingWithTeam } from "./events";
import { firstName, getMatch, getPairMatch, otherUserId, sideOf } from "./matches";

/**
 * The shared page of a revealed match: both people, the idea, upcoming
 * hackathons with each person's picks, and teams. Service client: every
 * function checks that the viewer is in the revealed match.
 */

export interface PairPerson {
  id: string;
  name: string;
  firstName: string;
  email: string;
  summary: string | null;
  tags: string[];
  githubUrl: string | null;
  linkedinUrl: string | null;
}

export interface PairEvent {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  mine: boolean;
  theirs: boolean;
  /** The other person is already on a team for this event (shown when SHOW_EXISTING_TEAMS is on). */
  otherAlreadyTeamed: boolean;
}

export interface PairTeam {
  id: string;
  eventId: string | null;
  eventName: string | null;
  members: { id: string; name: string; email: string }[];
}

export interface PairPage {
  matchId: string;
  me: PairPerson;
  other: PairPerson;
  idea: { id: string; pitch: string | null; rawText: string; status: string; mine: boolean } | null;
  events: PairEvent[];
  teams: PairTeam[];
  coffeeChat: string;
}

async function revealedMatchFor(matchId: string, viewerId: string) {
  const match = await getMatch(matchId);
  if (!match || !match.revealed_at || !sideOf(match, viewerId)) return null;
  return match;
}

export async function getPairPage(matchId: string, viewerId: string): Promise<PairPage | null> {
  const match = await revealedMatchFor(matchId, viewerId);
  if (!match) return null;
  const otherId = otherUserId(match, viewerId);
  const supabase = createServiceClient();
  const today = localDateString(getConfig().APP_TIMEZONE);

  const [users, profiles, idea, events, votes, teams] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, cornell_email, github_url, linkedin_url")
      .in("id", [viewerId, otherId]),
    supabase
      .from("profiles")
      .select("user_id, summary, skills, stack")
      .in("user_id", [viewerId, otherId]),
    match.idea_id
      ? supabase
          .from("ideas")
          .select("id, pitch, raw_text, status, owner_id")
          .eq("id", match.idea_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("events")
      .select("id, name, start_date, end_date")
      .gte("end_date", today)
      .order("start_date"),
    supabase.from("match_event_votes").select("user_id, event_id").eq("match_id", matchId),
    supabase
      .from("teams")
      .select("id, event_id, match_id, team_members(user_id)")
      .eq("match_id", matchId),
  ]);
  for (const result of [users, profiles, events, votes, teams]) {
    if (result.error) throw new Error(`getPairPage: ${result.error.message}`);
  }

  const person = (id: string): PairPerson => {
    const user = users.data!.find((u) => u.id === id)!;
    const profile = profiles.data!.find((p) => p.user_id === id);
    return {
      id,
      name: user.name?.trim() || user.cornell_email,
      firstName: firstName(user.name, user.cornell_email),
      email: user.cornell_email,
      summary: profile?.summary ?? null,
      tags: [...(profile?.stack ?? []), ...(profile?.skills ?? [])],
      githubUrl: user.github_url,
      linkedinUrl: user.linkedin_url,
    };
  };
  const me = person(viewerId);
  const other = person(otherId);

  // Events the other person is already on a team for, through any other match.
  let otherTeamedEvents = new Set<string>();
  if (getConfig().SHOW_EXISTING_TEAMS) {
    const { data, error } = await supabase
      .from("team_members")
      .select("teams(event_id, match_id)")
      .eq("user_id", otherId);
    if (error) throw new Error(`getPairPage: ${error.message}`);
    otherTeamedEvents = new Set(
      data
        .map((row) => row.teams)
        .filter((t): t is { event_id: string | null; match_id: string | null } => !!t)
        .filter((t) => t.match_id !== matchId && t.event_id)
        .map((t) => t.event_id!),
    );
  }

  const eventNames = new Map(events.data!.map((e) => [e.id, e.name]));
  const memberIds = [...new Set(teams.data!.flatMap((t) => t.team_members.map((m) => m.user_id)))];
  const { data: memberRows } = memberIds.length
    ? await supabase.from("users").select("id, name, cornell_email").in("id", memberIds)
    : { data: [] as { id: string; name: string | null; cornell_email: string }[] };

  return {
    matchId,
    me,
    other,
    idea: idea.data
      ? {
          id: idea.data.id,
          pitch: idea.data.pitch,
          rawText: idea.data.raw_text,
          status: idea.data.status,
          mine: idea.data.owner_id === viewerId,
        }
      : null,
    events: events.data!.map((event) => ({
      id: event.id,
      name: event.name,
      startDate: event.start_date,
      endDate: event.end_date,
      mine: votes.data!.some((v) => v.event_id === event.id && v.user_id === viewerId),
      theirs: votes.data!.some((v) => v.event_id === event.id && v.user_id === otherId),
      otherAlreadyTeamed: otherTeamedEvents.has(event.id),
    })),
    teams: teams.data!.map((team) => ({
      id: team.id,
      eventId: team.event_id,
      eventName: team.event_id ? (eventNames.get(team.event_id) ?? "A past event") : null,
      members: team.team_members.map((member) => {
        const row = memberRows?.find((u) => u.id === member.user_id);
        return {
          id: member.user_id,
          name: row?.name?.trim() || row?.cornell_email || "Member",
          email: row?.cornell_email ?? "",
        };
      }),
    })),
    coffeeChat: coffeeChatTemplate({
      senderName: me.firstName,
      recipientName: other.firstName,
      ideaPitch: idea.data?.pitch ?? null,
      recipientSummary: other.summary,
    }),
  };
}

/** Adds or removes the viewer's pick of an upcoming event on their match page. */
export async function setEventVote(
  matchId: string,
  viewerId: string,
  eventId: string,
  on: boolean,
): Promise<boolean> {
  if (!(await revealedMatchFor(matchId, viewerId))) return false;
  const supabase = createServiceClient();
  if (on) {
    const today = localDateString(getConfig().APP_TIMEZONE);
    const { data: event } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .gte("end_date", today)
      .maybeSingle();
    if (!event) return false;
    const { error } = await supabase
      .from("match_event_votes")
      .upsert(
        { match_id: matchId, user_id: viewerId, event_id: eventId },
        { onConflict: "match_id,user_id,event_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(`setEventVote: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("match_event_votes")
      .delete()
      .eq("match_id", matchId)
      .eq("user_id", viewerId)
      .eq("event_id", eventId);
    if (error) throw new Error(`setEventVote: ${error.message}`);
  }
  return true;
}

/** "We teamed up": one team per match and event, however often it is pressed. */
export async function teamUp(
  matchId: string,
  viewerId: string,
  eventId: string | null,
): Promise<{ teamId: string; created: boolean } | null> {
  if (!(await revealedMatchFor(matchId, viewerId))) return null;
  const { data, error } = await createServiceClient().rpc("team_up", {
    p_match: matchId,
    // Generated types mark every argument non-null; SQL accepts null for "no event".
    p_event: eventId as string,
    p_actor: viewerId,
  });
  if (error) throw new Error(`teamUp: ${error.message}`);
  const row = data[0];
  if (!row) return null;
  // Teaming up for an event means everyone on the team is going to it.
  if (eventId) await markGoingWithTeam(await teamMemberIds(row.team_id), eventId);
  if (row.created) {
    await track("team_formed", { match_id: matchId, has_event: eventId !== null }, viewerId);
  }
  return { teamId: row.team_id, created: row.created };
}

export type AddMemberResult = { ok: true } | { ok: false; error: string };

/**
 * Adds someone to a team the actor is on. Only people the actor has a
 * revealed match with can be added, so nobody joins a team with strangers.
 */
export async function addTeamMember(
  teamId: string,
  actorId: string,
  email: string,
): Promise<AddMemberResult> {
  const supabase = createServiceClient();
  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("team_id", teamId)
    .eq("user_id", actorId)
    .maybeSingle();
  if (!membership) return { ok: false, error: "You're not on that team." };

  const { data: invitee } = await supabase
    .from("users")
    .select("id")
    .eq("cornell_email", email.trim().toLowerCase())
    .maybeSingle();
  if (!invitee) return { ok: false, error: "No HackaMatch account has that email." };
  const match = await getPairMatch(actorId, invitee.id);
  if (!match?.revealed_at) {
    return { ok: false, error: "You can add people you have a mutual match with." };
  }

  const { error } = await supabase
    .from("team_members")
    .upsert(
      { team_id: teamId, user_id: invitee.id },
      { onConflict: "team_id,user_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`addTeamMember: ${error.message}`);
  const { data: team } = await supabase
    .from("teams")
    .select("event_id")
    .eq("id", teamId)
    .maybeSingle();
  if (team?.event_id) await markGoingWithTeam([invitee.id], team.event_id);
  return { ok: true };
}

async function teamMemberIds(teamId: string): Promise<string[]> {
  const { data, error } = await createServiceClient()
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId);
  if (error) throw new Error(`teamMemberIds: ${error.message}`);
  return data.map((row) => row.user_id).filter((id): id is string => id !== null);
}

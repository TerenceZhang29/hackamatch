"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { setIdeaStatus } from "@/server/ideas";
import { addTeamMember, setEventVote, teamUp } from "@/server/teams";

const form = (data: FormData) => Object.fromEntries(data);
const page = (matchId: string, query = "") => `/matches/${matchId}${query}`;

const voteSchema = z.object({
  matchId: z.uuid(),
  eventId: z.uuid(),
  on: z.enum(["true", "false"]),
});

/** Toggles the viewer's pick of an upcoming event on the pair page. */
export async function toggleVote(data: FormData) {
  const user = await requireOnboarded();
  const parsed = voteSchema.safeParse(form(data));
  if (!parsed.success) redirect("/matches");
  const { matchId, eventId, on } = parsed.data;
  await setEventVote(matchId, user.id, eventId, on === "true");
  revalidatePath(page(matchId));
  redirect(page(matchId));
}

const teamSchema = z.object({
  matchId: z.uuid(),
  eventId: z.uuid().or(z.literal("none")),
});

/** "We teamed up", for one event or for a side project with no event. */
export async function teamUpAction(data: FormData) {
  const user = await requireOnboarded();
  const parsed = teamSchema.safeParse(form(data));
  if (!parsed.success) redirect("/matches");
  const { matchId, eventId } = parsed.data;
  const result = await teamUp(matchId, user.id, eventId === "none" ? null : eventId);
  if (!result) redirect("/matches");
  revalidatePath(page(matchId));
  redirect(page(matchId, result.created ? "?teamed=1" : "?teamed=already"));
}

const memberSchema = z.object({
  matchId: z.uuid(),
  teamId: z.uuid(),
  email: z.string().trim().max(254),
});

export async function addMemberAction(data: FormData) {
  const user = await requireOnboarded();
  const parsed = memberSchema.safeParse(form(data));
  if (!parsed.success) redirect("/matches");
  const { matchId, teamId, email } = parsed.data;
  const result = await addTeamMember(teamId, user.id, email);
  revalidatePath(page(matchId));
  redirect(page(matchId, result.ok ? "?added=1" : `?error=${encodeURIComponent(result.error)}`));
}

const filledSchema = z.object({ matchId: z.uuid(), ideaId: z.uuid() });

/** Lets the idea owner close their idea once the team is set. */
export async function markIdeaFilled(data: FormData) {
  const user = await requireOnboarded();
  const parsed = filledSchema.safeParse(form(data));
  if (!parsed.success) redirect("/matches");
  await setIdeaStatus(user.id, parsed.data.ideaId, "filled");
  revalidatePath(page(parsed.data.matchId));
  redirect(page(parsed.data.matchId, "?filled=1"));
}

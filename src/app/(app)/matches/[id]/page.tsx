import { ArrowLeft, Briefcase, Code, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { KeepMatchingPrompt } from "@/components/EventPool";
import { Avatar } from "@/components/ui/Avatar";
import { buttonClass } from "@/components/ui/Button";
import { Chip, TagList } from "@/components/ui/Chip";
import { Notice } from "@/components/ui/Notice";
import { Section } from "@/components/ui/Section";
import { requireOnboarded } from "@/lib/auth";
import { formatDateRange } from "@/lib/time";
import { demoIds } from "@/server/board";
import { getEventPool } from "@/server/events";
import { getPairPage } from "@/server/teams";
import { addMemberAction, markIdeaFilled, teamUpAction, toggleVote } from "./actions";
import { CopyButton } from "./CopyButton";

export const metadata: Metadata = { title: "Your match · HackaMatch" };

const NOTICES: Record<string, string> = {
  teamed: "Team saved. Good luck!",
  already: "You're already a team for that.",
  added: "Added to your team.",
  filled: "Idea marked as filled.",
};

const pill = "inline-flex items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-sm font-medium";
const input = "h-11 min-w-0 rounded-xl border border-line bg-bg px-3 text-sm";

export default async function PairPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const user = await requireOnboarded(`/matches/${id}`);
  if (!z.guid().safeParse(id).success) notFound();
  const pair = await getPairPage(id, user.id);
  if (!pair) notFound();
  const query = await searchParams;
  const notice =
    query.teamed === "already"
      ? NOTICES.already
      : query.teamed
        ? NOTICES.teamed
        : query.added
          ? NOTICES.added
          : query.filled
            ? NOTICES.filled
            : null;
  const error = typeof query.error === "string" ? query.error : null;

  const overlapping = pair.events.filter((e) => e.mine && e.theirs);
  const teamOptions = [...overlapping, ...pair.events.filter((e) => !(e.mine && e.theirs))];
  // Events you both picked count as a match there; ask once per new match whether to keep matching.
  const askToKeepMatching = new Set(
    (
      await Promise.all(
        overlapping.map(async (e) =>
          (await getEventPool(user.id, e.id)).askToKeepMatching ? e.id : null,
        ),
      )
    ).filter((id): id is string => id !== null),
  );
  const other = pair.other;
  const otherIsDemo = (await demoIds([other.id])).users.has(other.id);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link href="/matches" aria-label="Matches" className="-ml-2 rounded-full p-2 text-muted">
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Link>
        <div className="flex -space-x-2">
          <Avatar name={other.name} />
          <span className="rounded-full ring-2 ring-bg">
            <Avatar name={pair.me.name} />
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">You and {other.firstName}</h1>
      </header>
      {otherIsDemo ? (
        <Notice>
          {other.firstName} is a demo profile for testing: not a real person, and nothing is
          emailed.
        </Notice>
      ) : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <article aria-label={other.name} className="flex flex-col gap-3 rounded-2xl bg-surface p-5">
        <h2 className="text-lg font-semibold">{other.name}</h2>
        {other.summary ? <p className="text-sm">{other.summary}</p> : null}
        <TagList tags={other.tags.slice(0, 8)} label="Skills" />
        <ul className="flex flex-wrap gap-2" aria-label="Contact">
          <li>
            <a href={`mailto:${other.email}`} className={pill}>
              <Mail aria-hidden="true" className="size-4" />
              {other.email}
            </a>
          </li>
          {other.githubUrl ? (
            <li>
              <a href={other.githubUrl} className={pill} rel="noopener noreferrer">
                <Code aria-hidden="true" className="size-4" />
                GitHub
              </a>
            </li>
          ) : null}
          {other.linkedinUrl ? (
            <li>
              <a href={other.linkedinUrl} className={pill} rel="noopener noreferrer">
                <Briefcase aria-hidden="true" className="size-4" />
                LinkedIn
              </a>
            </li>
          ) : null}
        </ul>
      </article>

      {pair.idea ? (
        <Section id="idea" title="The idea">
          <div className="flex flex-col gap-2 rounded-2xl bg-surface p-5">
            {pair.idea.pitch ? <p className="font-semibold">{pair.idea.pitch}</p> : null}
            <p className="text-sm whitespace-pre-line">{pair.idea.rawText}</p>
            {pair.idea.mine && pair.idea.status === "open" && pair.teams.length > 0 ? (
              <form action={markIdeaFilled}>
                <input type="hidden" name="matchId" value={pair.matchId} />
                <input type="hidden" name="ideaId" value={pair.idea.id} />
                <button type="submit" className="text-sm text-muted underline">
                  Team is set? Mark this idea as filled
                </button>
              </form>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section id="message" title="Say hi">
        <div className="flex flex-col gap-3 rounded-2xl bg-accent-soft p-5">
          <p className="text-sm text-accent-soft-ink">{pair.coffeeChat}</p>
          <CopyButton text={pair.coffeeChat} />
        </div>
      </Section>

      <Section id="events" title="Hackathons">
        {pair.events.length === 0 ? (
          <p className="text-sm text-muted">None coming up.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pair.events.map((event) => {
              const both = event.mine && event.theirs;
              return (
                <li
                  key={event.id}
                  aria-label={event.name}
                  className={`flex flex-wrap items-center gap-3 rounded-2xl p-3 ${
                    both ? "bg-success-soft" : "bg-surface"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{event.name}</span>
                    <span className="text-xs text-muted">
                      {formatDateRange(event.startDate, event.endDate)}
                      {both ? null : event.theirs ? ` · ${other.firstName} would` : null}
                    </span>
                  </div>
                  {both ? <Chip tone="success">You both want this</Chip> : null}
                  {event.otherAlreadyTeamed ? <Chip>{other.firstName} has a team</Chip> : null}
                  <form action={toggleVote}>
                    <input type="hidden" name="matchId" value={pair.matchId} />
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="on" value={String(!event.mine)} />
                    <button
                      type="submit"
                      aria-pressed={event.mine}
                      className={buttonClass(
                        event.mine ? "primary" : "secondary",
                        "sm",
                        event.mine ? "" : "bg-bg",
                      )}
                    >
                      {event.mine ? "I'd do it" : "I'd do this"}
                    </button>
                  </form>
                  {askToKeepMatching.has(event.id) ? (
                    <div className="basis-full">
                      <KeepMatchingPrompt
                        eventId={event.id}
                        eventName={event.name}
                        returnTo={`/matches/${pair.matchId}`}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section id="team" title="Team">
        <form action={teamUpAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="matchId" value={pair.matchId} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor="team-event" className="text-xs font-medium text-muted">
              For which event?
            </label>
            <select
              id="team-event"
              name="eventId"
              defaultValue={overlapping[0]?.id ?? "none"}
              className={input}
            >
              {teamOptions.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                  {event.mine && event.theirs ? " (you both picked it)" : ""}
                </option>
              ))}
              <option value="none">No event / side project</option>
            </select>
          </div>
          <button type="submit" className={buttonClass("primary", "md")}>
            We teamed up
          </button>
        </form>

        {pair.teams.map((team) => (
          <div
            key={team.id}
            aria-label={`Team for ${team.eventName ?? "a side project"}`}
            className="flex flex-col gap-3 rounded-2xl bg-surface p-4"
          >
            <p className="text-sm font-semibold">{team.eventName ?? "Side project"}</p>
            <ul className="flex flex-wrap gap-3">
              {team.members.map((member) => (
                <li key={member.id} className="flex items-center gap-2 text-sm">
                  <Avatar name={member.name} size={32} />
                  {member.name}
                </li>
              ))}
            </ul>
            <form action={addMemberAction} className="flex gap-2">
              <input type="hidden" name="matchId" value={pair.matchId} />
              <input type="hidden" name="teamId" value={team.id} />
              <label htmlFor={`add-${team.id}`} className="sr-only">
                Add a teammate by Cornell email
              </label>
              <input
                id={`add-${team.id}`}
                name="email"
                type="email"
                required
                placeholder="netid@cornell.edu"
                className={`${input} flex-1`}
              />
              <button type="submit" className={buttonClass("outline", "md")}>
                Add
              </button>
            </form>
          </div>
        ))}
      </Section>
    </main>
  );
}

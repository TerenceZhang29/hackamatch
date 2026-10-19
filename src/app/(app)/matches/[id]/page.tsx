import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Chips } from "@/components/Card";
import { KeepMatchingPrompt } from "@/components/EventPool";
import { requireOnboarded } from "@/lib/auth";
import { formatDateRange } from "@/lib/time";
import { getEventPool } from "@/server/events";
import { getPairPage, type PairPerson } from "@/server/teams";
import { addMemberAction, markIdeaFilled, teamUpAction, toggleVote } from "./actions";
import { CopyButton } from "./CopyButton";

export const metadata: Metadata = { title: "Your match · HackaMatch" };

const NOTICES: Record<string, string> = {
  teamed: "Team saved. Good luck!",
  already: "You're already a team for that.",
  added: "Added to your team.",
  filled: "Your idea is marked as filled.",
};

function Person({ person, you }: { person: PairPerson; you?: boolean }) {
  return (
    <article
      aria-label={you ? "You" : person.name}
      className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <h2 className="font-semibold">{you ? `${person.name} (you)` : person.name}</h2>
      {person.summary ? <p className="text-sm">{person.summary}</p> : null}
      <Chips tags={person.tags.slice(0, 8)} label="Skills" />
      {!you ? (
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            <a href={`mailto:${person.email}`} className="underline">
              {person.email}
            </a>
          </li>
          {person.githubUrl ? (
            <li>
              <a href={person.githubUrl} className="underline" rel="noopener noreferrer">
                GitHub
              </a>
            </li>
          ) : null}
          {person.linkedinUrl ? (
            <li>
              <a href={person.linkedinUrl} className="underline" rel="noopener noreferrer">
                LinkedIn
              </a>
            </li>
          ) : null}
        </ul>
      ) : null}
    </article>
  );
}

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

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12">
      <Link href="/matches" className="text-sm underline">
        ← Your matches
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">You and {pair.other.firstName}</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Matches never expire, and you both stay in the pool.
        </p>
      </header>
      {notice ? (
        <p
          role="status"
          className="rounded-lg bg-neutral-100 px-4 py-3 text-sm dark:bg-neutral-900"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Person person={pair.other} />
        <Person person={pair.me} you />
      </div>

      {pair.idea ? (
        <section aria-labelledby="idea-heading" className="flex flex-col gap-2">
          <h2 id="idea-heading" className="text-lg font-semibold">
            The idea
          </h2>
          {pair.idea.pitch ? <p className="font-medium">{pair.idea.pitch}</p> : null}
          <p className="whitespace-pre-line text-neutral-700 dark:text-neutral-300">
            {pair.idea.rawText}
          </p>
          {pair.idea.mine && pair.idea.status === "open" && pair.teams.length > 0 ? (
            <form action={markIdeaFilled}>
              <input type="hidden" name="matchId" value={pair.matchId} />
              <input type="hidden" name="ideaId" value={pair.idea.id} />
              <button type="submit" className="text-sm underline">
                Team is set? Mark this idea as filled
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="message-heading" className="flex flex-col gap-2">
        <h2 id="message-heading" className="text-lg font-semibold">
          Say hi
        </h2>
        <p className="rounded-lg border-l-4 border-neutral-300 bg-neutral-50 px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900">
          {pair.coffeeChat}
        </p>
        <CopyButton text={pair.coffeeChat} />
      </section>

      <section aria-labelledby="events-heading" className="flex flex-col gap-3">
        <h2 id="events-heading" className="text-lg font-semibold">
          Upcoming hackathons
        </h2>
        {pair.events.length === 0 ? (
          <p className="text-sm text-neutral-500">No upcoming hackathons yet.</p>
        ) : (
          <>
            <p className="text-sm text-neutral-500">
              Tap the ones you&apos;d do. Ones you both pick are highlighted.
            </p>
            <ul className="flex flex-col gap-2">
              {pair.events.map((event) => {
                const both = event.mine && event.theirs;
                return (
                  <li
                    key={event.id}
                    aria-label={event.name}
                    className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${
                      both
                        ? "border-green-600 bg-green-50 dark:bg-green-950"
                        : "border-neutral-200 dark:border-neutral-800"
                    }`}
                  >
                    <form action={toggleVote}>
                      <input type="hidden" name="matchId" value={pair.matchId} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="on" value={String(!event.mine)} />
                      <button
                        type="submit"
                        aria-pressed={event.mine}
                        className={`rounded-full border px-3 py-1 text-sm ${
                          event.mine
                            ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                            : "border-neutral-300 dark:border-neutral-700"
                        }`}
                      >
                        {event.mine ? "I'd do it" : "I'd do this"}
                      </button>
                    </form>
                    <span className="font-medium">{event.name}</span>
                    <span className="text-sm text-neutral-500">
                      {formatDateRange(event.startDate, event.endDate)}
                    </span>
                    {both ? (
                      <span className="text-sm font-medium text-green-800 dark:text-green-300">
                        You both want this
                      </span>
                    ) : event.theirs ? (
                      <span className="text-sm text-neutral-500">{pair.other.firstName} would</span>
                    ) : null}
                    {askToKeepMatching.has(event.id) ? (
                      <div className="basis-full">
                        <KeepMatchingPrompt
                          eventId={event.id}
                          eventName={event.name}
                          returnTo={`/matches/${pair.matchId}`}
                        />
                      </div>
                    ) : null}
                    {event.otherAlreadyTeamed ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100">
                        {pair.other.firstName} already has a team for this
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="team-heading" className="flex flex-col gap-3">
        <h2 id="team-heading" className="text-lg font-semibold">
          We teamed up
        </h2>
        <form action={teamUpAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="matchId" value={pair.matchId} />
          <div className="flex flex-col gap-1">
            <label htmlFor="team-event" className="text-sm">
              For which event?
            </label>
            <select
              id="team-event"
              name="eventId"
              defaultValue={overlapping[0]?.id ?? "none"}
              className="rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
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
          <button
            type="submit"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            We teamed up
          </button>
        </form>

        {pair.teams.map((team) => (
          <div
            key={team.id}
            aria-label={`Team for ${team.eventName ?? "a side project"}`}
            className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <p className="font-medium">Team for {team.eventName ?? "a side project"}</p>
            <ul className="text-sm">
              {team.members.map((member) => (
                <li key={member.id}>{member.name}</li>
              ))}
            </ul>
            <form action={addMemberAction} className="flex flex-wrap gap-2">
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
                placeholder="netid@cornell.edu of a mutual match"
                className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm dark:border-neutral-700"
              />
              <button
                type="submit"
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
              >
                Add
              </button>
            </form>
          </div>
        ))}
      </section>
    </main>
  );
}

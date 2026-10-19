import type { Metadata } from "next";
import Link from "next/link";
import { MatchAnswerButtons } from "@/components/AnswerButtons";
import { Chips } from "@/components/Card";
import { MyHackathons } from "@/components/MyHackathons";
import { Outcome } from "@/components/Outcome";
import { requireOnboarded } from "@/lib/auth";
import { listMyEvents } from "@/server/events";
import { listMatchesForUser, type MatchListItem } from "@/server/matches";

export const metadata: Metadata = { title: "Matches · HackaMatch" };

const SECTIONS = [
  {
    key: "waiting",
    title: "Waiting on you",
    empty: "Nothing waiting. New matches show up here and in your email.",
  },
  { key: "mutual", title: "Mutual", empty: "No mutual matches yet." },
  { key: "sent", title: "Sent", empty: "People you said Interested to will show up here." },
] as const;

function MatchCard({ match }: { match: MatchListItem }) {
  return (
    <article
      aria-label={match.otherName}
      className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">
          {match.section === "mutual" ? (
            <Link href={`/matches/${match.id}`} className="hover:underline">
              {match.otherName}
            </Link>
          ) : (
            <Link href={`/people/${match.otherId}`} className="hover:underline">
              {match.otherName}
            </Link>
          )}
        </h3>
        {match.isNew ? (
          <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
            New
          </span>
        ) : null}
      </div>
      {match.ideaPitch ? (
        <p className="text-sm text-neutral-500">
          {match.ideaIsMine ? "About your idea: " : "Their idea: "}
          {match.ideaPitch}
        </p>
      ) : null}
      {match.otherSummary ? <p className="text-sm">{match.otherSummary}</p> : null}
      <Chips tags={match.otherTags} label="Skills" />
      {match.reason ? <p className="text-sm text-neutral-500">Why: {match.reason}</p> : null}
      {match.section === "waiting" ? <MatchAnswerButtons matchId={match.id} /> : null}
      {match.section === "mutual" ? (
        <Link href={`/matches/${match.id}`} className="self-start text-sm font-medium underline">
          Contact details and hackathons →
        </Link>
      ) : null}
    </article>
  );
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireOnboarded("/matches");
  const params = await searchParams;
  const welcome = params.welcome !== undefined;
  const [matches, hackathons] = await Promise.all([
    listMatchesForUser(user.id),
    listMyEvents(user.id),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Your matches</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/" className="underline">
            Board
          </Link>
          <Link href="/ideas/new" className="underline">
            Post an idea
          </Link>
          <Link href="/me" className="underline">
            Profile
          </Link>
        </nav>
      </header>
      {welcome ? (
        <p
          role="status"
          className="rounded-lg bg-neutral-100 px-4 py-3 text-sm dark:bg-neutral-900"
        >
          You&apos;re in the pool. We&apos;ll send you people to build with.
        </p>
      ) : null}
      <Outcome params={params} />
      <MyHackathons data={hackathons} />

      {SECTIONS.map((section) => {
        const items = matches.filter((m) => m.section === section.key);
        return (
          <section
            key={section.key}
            aria-labelledby={`section-${section.key}`}
            className="flex flex-col gap-3"
          >
            <h2 id={`section-${section.key}`} className="text-lg font-semibold">
              {section.title}
              {items.length ? <span className="ml-2 text-neutral-500">{items.length}</span> : null}
            </h2>
            {items.length ? (
              <ul className="flex flex-col gap-3">
                {items.map((match) => (
                  <li key={match.id}>
                    <MatchCard match={match} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500">{section.empty}</p>
            )}
          </section>
        );
      })}

      <p className="text-sm text-neutral-500">
        You&apos;re signed in as <span className="break-all">{user.cornell_email}</span>. Browse the{" "}
        <Link href="/" className="underline">
          board
        </Link>{" "}
        to find more people.
      </p>
      <form action="/logout" method="post">
        <button type="submit" className="text-sm underline">
          Sign out
        </button>
      </form>
    </main>
  );
}

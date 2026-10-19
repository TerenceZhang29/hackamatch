import { ChevronRight, Hourglass, Inbox, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MatchAnswerButtons } from "@/components/AnswerButtons";
import { MyHackathons } from "@/components/MyHackathons";
import { Outcome } from "@/components/Outcome";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { requireOnboarded } from "@/lib/auth";
import { listMyEvents } from "@/server/events";
import { listMatchesForUser, type MatchListItem } from "@/server/matches";

export const metadata: Metadata = { title: "Matches · HackaMatch" };

const SECTIONS = [
  {
    key: "waiting",
    title: "Waiting on you",
    tab: "Waiting",
    empty: "Nothing waiting",
    icon: Inbox,
  },
  { key: "mutual", title: "Mutual", tab: "Mutual", empty: "No mutual matches yet", icon: Users },
  { key: "sent", title: "Sent", tab: "Sent", empty: "Nothing sent yet", icon: Hourglass },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

/** One match as a compact row: avatar, name, one line of context, and its action. */
function MatchRow({ match }: { match: MatchListItem }) {
  const href = match.section === "mutual" ? `/matches/${match.id}` : `/people/${match.otherId}`;
  const line = match.ideaPitch
    ? `${match.ideaIsMine ? "Your idea: " : ""}${match.ideaPitch}`
    : match.otherSummary;
  return (
    <article
      aria-label={match.otherName}
      className="flex items-center gap-3 rounded-2xl bg-surface p-3"
    >
      <Avatar name={match.otherName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="flex items-center gap-2 font-semibold">
          <Link href={href} className="truncate hover:underline">
            {match.otherName}
          </Link>
          {match.isNew ? <Chip tone="accent">New</Chip> : null}
        </h3>
        {line ? <p className="truncate text-sm text-muted">{line}</p> : null}
        {match.reason ? <p className="truncate text-xs text-muted">{match.reason}</p> : null}
      </div>
      {match.section === "waiting" ? <MatchAnswerButtons matchId={match.id} /> : null}
      {match.section === "mutual" ? (
        <Link
          href={`/matches/${match.id}`}
          aria-label={`Open ${match.otherName}`}
          className="text-muted"
        >
          <ChevronRight aria-hidden="true" className="size-5" />
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
  const bySection = (key: SectionKey) => matches.filter((m) => m.section === key);
  // Open on the tab asked for, else the first one with something in it.
  const asked = SECTIONS.find((s) => s.key === params.tab)?.key;
  const current: SectionKey =
    asked ?? SECTIONS.find((s) => bySection(s.key).length > 0)?.key ?? "waiting";
  const section = SECTIONS.find((s) => s.key === current)!;
  const items = bySection(current);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Matches</h1>
      {welcome ? <Notice tone="success">You&apos;re in the pool.</Notice> : null}
      <Outcome params={params} />
      <MyHackathons data={hackathons} />

      <div className="flex flex-col gap-3">
        <nav aria-label="Match lists" className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
          {SECTIONS.map((s) => {
            const count = bySection(s.key).length;
            const on = s.key === current;
            return (
              <Link
                key={s.key}
                href={`/matches?tab=${s.key}`}
                aria-current={on ? "page" : undefined}
                className={`rounded-lg px-2 py-2 text-center text-sm font-medium ${
                  on ? "bg-bg text-ink shadow-sm" : "text-muted"
                }`}
              >
                {s.tab}
                {count ? <span className="ml-1 text-muted">{count}</span> : null}
              </Link>
            );
          })}
        </nav>
        <section aria-labelledby="match-list-heading" className="flex flex-col gap-2">
          <h2 id="match-list-heading" className="sr-only">
            {section.title}
          </h2>
          {items.length ? (
            <ul className="flex flex-col gap-2">
              {items.map((match) => (
                <li key={match.id}>
                  <MatchRow match={match} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={section.icon} title={section.empty}>
              <Button href="/" variant="outline">
                Discover
              </Button>
            </EmptyState>
          )}
        </section>
      </div>
    </main>
  );
}

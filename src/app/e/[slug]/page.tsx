import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CardAnswerButtons } from "@/components/AnswerButtons";
import { CardActions, type Viewer } from "@/components/CardActions";
import { IdeaCard } from "@/components/IdeaCard";
import { PersonCard } from "@/components/PersonCard";
import { getUser } from "@/lib/auth";
import { formatDateRange } from "@/lib/time";
import { excludedUserIds, listBoardIdeas, listBoardPeople } from "@/server/board";
import {
  addEventInterests,
  countEventInterest,
  getEventBySlug,
  hasEnded,
  listEventInterestIds,
} from "@/server/events";
import { setEventInterestAction } from "./actions";

const SHOWN = 6;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const event = await getEventBySlug((await params).slug);
  return { title: event ? `${event.name} · HackaMatch` : "HackaMatch" };
}

const primaryButton =
  "rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900";

/**
 * The link organizers share. Shows the event and who is looking for a team,
 * and lets people say they're in. `?join=1` (where sign-in returns new and
 * returning users) tags the event for an onboarded member.
 */
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ join?: string }>;
}) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const ended = hasEnded(event);
  const user = await getUser();
  const viewer: Viewer = !user ? "anon" : user.onboarded_at ? "onboarded" : "not-onboarded";
  const joinPath = `/e/${slug}?join=1`;

  if ((await searchParams).join === "1" && viewer === "onboarded" && !ended) {
    await addEventInterests(user!.id, [event.id]);
    redirect(`/e/${slug}`);
  }

  const exclude = await excludedUserIds(viewer === "onboarded" ? user!.id : null);
  const filters = { event: slug, domain: null, skill: null, intent: null };
  const [count, ideas, people, interests] = await Promise.all([
    countEventInterest(event.id),
    listBoardIdeas(filters, SHOWN, exclude),
    listBoardPeople(filters, SHOWN, exclude),
    viewer === "onboarded" ? listEventInterestIds(user!.id) : Promise.resolve([]),
  ]);
  const interested = interests.includes(event.id);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-tight">
          HackaMatch
        </Link>
        {viewer === "anon" ? (
          <Link href="/login" className="text-sm underline">
            Sign in
          </Link>
        ) : null}
      </header>

      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{event.name}</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          {formatDateRange(event.start_date, event.end_date)} · Teams of {event.team_size_min}–
          {event.team_size_max}
          {event.url ? (
            <>
              {" · "}
              <a href={event.url} className="underline" rel="noopener noreferrer">
                Event site
              </a>
            </>
          ) : null}
        </p>
        {event.description ? <p>{event.description}</p> : null}
        <p className="font-medium">
          {count === 1 ? "1 person is" : `${count} people are`} looking for teammates for this
          event.
        </p>

        {ended ? (
          <p className="text-neutral-500">This event has ended.</p>
        ) : viewer === "anon" ? (
          <Link
            href={`/join?${new URLSearchParams({ next: joinPath, from: "event" })}`}
            prefetch={false}
            className={`self-start ${primaryButton}`}
          >
            Find a team for this event
          </Link>
        ) : viewer === "not-onboarded" ? (
          <Link
            href={`/onboarding?${new URLSearchParams({ next: joinPath })}`}
            className={`self-start ${primaryButton}`}
          >
            Finish joining to find a team
          </Link>
        ) : (
          <form action={setEventInterestAction}>
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="interested" value={String(!interested)} />
            {interested ? (
              <p className="flex flex-wrap items-center gap-3">
                <span className="font-medium">You&apos;re in for this event.</span>
                <button type="submit" className="text-sm underline">
                  I&apos;m not going after all
                </button>
              </p>
            ) : (
              <button type="submit" className={primaryButton}>
                I&apos;m interested in this event
              </button>
            )}
          </form>
        )}
      </section>

      <section aria-labelledby="event-ideas" className="flex flex-col gap-3">
        <h2 id="event-ideas" className="text-lg font-semibold">
          Ideas for this event
        </h2>
        {ideas.rows.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ideas.rows.map((idea) => (
              <li key={idea.id}>
                <IdeaCard
                  idea={idea}
                  actions={
                    <CardActions
                      viewer={viewer}
                      cardPath={`/ideas/${idea.id}`}
                      onboarded={
                        <CardAnswerButtons kind="idea" targetId={idea.id} returnTo={`/e/${slug}`} />
                      }
                    />
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">No ideas tagged with this event yet.</p>
        )}
      </section>

      <section aria-labelledby="event-builders" className="flex flex-col gap-3">
        <h2 id="event-builders" className="text-lg font-semibold">
          Builders going
        </h2>
        {people.rows.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {people.rows.map((person) => (
              <li key={person.user_id}>
                <PersonCard
                  person={person}
                  actions={
                    <CardActions
                      viewer={viewer}
                      cardPath={`/people/${person.user_id}`}
                      onboarded={
                        <CardAnswerButtons
                          kind="person"
                          targetId={person.user_id}
                          returnTo={`/e/${slug}`}
                        />
                      }
                    />
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">No builders have tagged this event yet.</p>
        )}
      </section>

      {ideas.hasMore || people.hasMore ? (
        <Link href={`/?event=${slug}`} className="self-center text-sm underline">
          See everyone on the board
        </Link>
      ) : null}
    </main>
  );
}

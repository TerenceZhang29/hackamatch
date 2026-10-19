import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CardAnswerButtons } from "@/components/AnswerButtons";
import { CardActions, type Viewer } from "@/components/CardActions";
import { EventPoolPanel } from "@/components/EventPool";
import { IdeaCard } from "@/components/IdeaCard";
import { PersonCard } from "@/components/PersonCard";
import { SeeAllPrompt } from "@/components/SeeAllPrompt";
import { getUser } from "@/lib/auth";
import { EVENT_PAGE_SIZE, parseShown, VISITOR_LIMIT } from "@/lib/board";
import { formatDateRange } from "@/lib/time";
import { excludedUserIds, listBoardIdeas, listBoardPeople } from "@/server/board";
import {
  addEventInterests,
  countEventInterest,
  getEventBySlug,
  getEventPool,
  hasEnded,
} from "@/server/events";

/** The event page URL with how many people and ideas to show; defaults are left out. */
function eventHref(slug: string, people: number, ideas: number) {
  const params = new URLSearchParams();
  if (people > EVENT_PAGE_SIZE) params.set("people", String(people));
  if (ideas > EVENT_PAGE_SIZE) params.set("ideas", String(ideas));
  const query = params.toString();
  return query ? `/e/${slug}?${query}` : `/e/${slug}`;
}

const showMoreClass =
  "self-center rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700";

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
 * The link organizers share. Shows the event, everyone going and its ideas,
 * and lets people say they're in. Members see every card ("Show more" pages
 * through `?people=` / `?ideas=`); visitors see VISITOR_LIMIT of each and a
 * prompt to sign in. `?join=1` (where sign-in returns new and returning users)
 * tags the event for an onboarded member.
 */
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ join?: string; people?: string; ideas?: string; confirm?: string }>;
}) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const ended = hasEnded(event);
  const user = await getUser();
  const viewer: Viewer = !user ? "anon" : user.onboarded_at ? "onboarded" : "not-onboarded";
  const joinPath = `/e/${slug}?join=1`;
  const query = await searchParams;

  if (query.join === "1" && viewer === "onboarded" && !ended) {
    await addEventInterests(user!.id, [event.id]);
    redirect(`/e/${slug}`);
  }

  const exclude = await excludedUserIds(viewer === "onboarded" ? user!.id : null);
  const filters = { event: slug, domain: null, skill: null, intent: null };
  const peopleShown =
    viewer === "onboarded" ? parseShown(query.people, EVENT_PAGE_SIZE) : VISITOR_LIMIT;
  const ideasShown =
    viewer === "onboarded" ? parseShown(query.ideas, EVENT_PAGE_SIZE) : VISITOR_LIMIT;
  const [count, ideas, people, pool] = await Promise.all([
    countEventInterest(event.id),
    listBoardIdeas(filters, ideasShown, exclude),
    listBoardPeople(filters, peopleShown, exclude, null),
    viewer === "onboarded" ? getEventPool(user!.id, event.id) : Promise.resolve(null),
  ]);
  const here = eventHref(slug, peopleShown, ideasShown);

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

      <Link href="/events" className="-mb-4 self-start text-sm underline">
        ← All events
      </Link>

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
          <>
            <Link
              href={`/?event=${slug}`}
              className="self-start rounded-lg border border-neutral-300 px-4 py-2 font-medium dark:border-neutral-700"
            >
              Find teammates for this event
            </Link>
            <EventPoolPanel
              eventId={event.id}
              eventName={event.name}
              slug={slug}
              pool={pool!}
              confirmNotGoing={query.confirm === "not-going"}
            />
          </>
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
                        <CardAnswerButtons kind="idea" targetId={idea.id} returnTo={here} />
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
        {!ideas.hasMore ? null : viewer === "onboarded" ? (
          <Link
            href={eventHref(slug, peopleShown, ideasShown + EVENT_PAGE_SIZE)}
            scroll={false}
            className={showMoreClass}
          >
            Show more ideas
          </Link>
        ) : (
          <SeeAllPrompt viewer={viewer} next={`/e/${slug}`} what="ideas for this event" />
        )}
      </section>

      <section aria-labelledby="event-people" className="flex flex-col gap-3">
        <h2 id="event-people" className="text-lg font-semibold">
          People going
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
                          returnTo={here}
                        />
                      }
                    />
                  }
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">No one has tagged this event yet.</p>
        )}
        {!people.hasMore ? null : viewer === "onboarded" ? (
          <Link
            href={eventHref(slug, peopleShown + EVENT_PAGE_SIZE, ideasShown)}
            scroll={false}
            className={showMoreClass}
          >
            Show more people
          </Link>
        ) : (
          <SeeAllPrompt
            viewer={viewer}
            next={`/e/${slug}`}
            what={count === 1 ? "1 person going" : `${count} people going`}
          />
        )}
      </section>
    </main>
  );
}

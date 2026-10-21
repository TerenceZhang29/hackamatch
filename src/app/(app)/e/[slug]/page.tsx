import type { Metadata } from "next";
import { ArrowLeft, CalendarDays, Compass, ExternalLink, Users } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CardAnswerButtons } from "@/components/AnswerButtons";
import { CardActions, type Viewer } from "@/components/CardActions";
import { EventPoolPanel } from "@/components/EventPool";
import { IdeaCard } from "@/components/IdeaCard";
import { ideaHackathons } from "@/lib/person-card";
import { PersonCard } from "@/components/PersonCard";
import { SeeAllPrompt } from "@/components/SeeAllPrompt";
import { Button, buttonClass } from "@/components/ui/Button";
import { Chip, chipClass } from "@/components/ui/Chip";
import { getUser } from "@/lib/auth";
import { EVENT_PAGE_SIZE, parseShown, VISITOR_LIMIT } from "@/lib/board";
import { formatDateRange } from "@/lib/time";
import {
  boardExclusions,
  ideaCounts,
  listBoardIdeas,
  demoIds,
  listBoardPeople,
  poolEventsFor,
} from "@/server/board";
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

const showMoreClass = buttonClass("secondary", "sm", "self-center");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const event = await getEventBySlug((await params).slug);
  return { title: event ? `${event.name} · HackaMatch` : "HackaMatch" };
}

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

  const exclude = await boardExclusions(viewer === "onboarded" ? user!.id : null);
  const filters = { event: slug, domain: null, skill: null, intent: null };
  const peopleShown =
    viewer === "onboarded" ? parseShown(query.people, EVENT_PAGE_SIZE) : VISITOR_LIMIT;
  const ideasShown =
    viewer === "onboarded" ? parseShown(query.ideas, EVENT_PAGE_SIZE) : VISITOR_LIMIT;
  const [count, ideas, people, pool] = await Promise.all([
    countEventInterest(event.id),
    listBoardIdeas(filters, ideasShown, exclude.users, exclude.ideas),
    listBoardPeople(filters, peopleShown, exclude.people, null),
    viewer === "onboarded" ? getEventPool(user!.id, event.id) : Promise.resolve(null),
  ]);
  const here = eventHref(slug, peopleShown, ideasShown);
  const peopleIds = people.rows.map((p) => p.user_id);
  const ownerIds = ideas.rows.map((i) => i.owner_id);
  const [counts, looking, demo] = await Promise.all([
    ideaCounts(peopleIds),
    viewer === "onboarded"
      ? poolEventsFor([...peopleIds, ...ownerIds])
      : Promise.resolve(new Map()),
    demoIds(
      peopleIds,
      ideas.rows.map((i) => i.id),
    ),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-6">
      <section className="flex flex-col gap-4">
        <Link
          href="/events"
          aria-label="All events"
          className="-ml-2 self-start rounded-full p-2 text-muted"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">{event.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Chip>
            <CalendarDays aria-hidden="true" className="size-3" />
            {formatDateRange(event.start_date, event.end_date)}
          </Chip>
          <Chip>
            Teams of {event.team_size_min}–{event.team_size_max}
          </Chip>
          <Chip tone="accent">
            <Users aria-hidden="true" className="size-3" />
            {count} looking
          </Chip>
          {event.url ? (
            <a href={event.url} className={chipClass()} rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" className="size-3" />
              Event site
            </a>
          ) : null}
        </div>
        {event.description ? <p className="text-muted">{event.description}</p> : null}

        {ended ? (
          <Chip>This event has ended.</Chip>
        ) : viewer === "anon" ? (
          <Button
            href={`/join?${new URLSearchParams({ next: joinPath, from: "event" })}`}
            prefetch={false}
            size="lg"
            className="self-start"
          >
            Find a team for this event
          </Button>
        ) : viewer === "not-onboarded" ? (
          <Button
            href={`/onboarding?${new URLSearchParams({ next: joinPath })}`}
            size="lg"
            className="self-start"
          >
            Finish joining to find a team
          </Button>
        ) : (
          <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
            <Button href={`/?event=${slug}`} variant="outline" className="self-start">
              <Compass aria-hidden="true" className="size-4" />
              Find teammates for this event
            </Button>
            <EventPoolPanel
              eventId={event.id}
              eventName={event.name}
              slug={slug}
              pool={pool!}
              confirmNotGoing={query.confirm === "not-going"}
            />
          </div>
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
                  hackathons={
                    viewer === "onboarded"
                      ? ideaHackathons(
                          { id: event.id, name: event.name, startDate: event.start_date },
                          looking.get(idea.owner_id) ?? [],
                        )
                      : undefined
                  }
                  isDemo={demo.ideas.has(idea.id)}
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
          <p className="text-sm text-muted">No ideas tagged with this event yet.</p>
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
                  ideaCount={counts.get(person.user_id) ?? 0}
                  lookingEvents={looking.get(person.user_id)}
                  isDemo={demo.users.has(person.user_id)}
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
          <p className="text-sm text-muted">No one has tagged this event yet.</p>
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

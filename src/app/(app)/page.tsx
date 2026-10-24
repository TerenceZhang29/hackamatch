import { SearchX } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { CardAnswerButtons } from "@/components/AnswerButtons";
import { BoardFilters } from "@/components/BoardFilters";
import { CardActions, type Viewer } from "@/components/CardActions";
import { DeckView } from "@/components/deck/DeckView";
import { EmptyState } from "@/components/ui/EmptyState";
import { Landing } from "@/components/landing/Landing";
import { Notice } from "@/components/ui/Notice";
import { Outcome } from "@/components/Outcome";
import { PersonCard } from "@/components/PersonCard";
import { SeeAllPrompt } from "@/components/SeeAllPrompt";
import { track } from "@/lib/analytics";
import { getUser } from "@/lib/auth";
import {
  BOARD_PARAM_KEYS,
  boardHref,
  hasFilters,
  LANDING_EVENTS,
  PAGE_SIZE,
  parseBoardParams,
  VISITOR_LIMIT,
  wantsDeck,
  type BoardState,
} from "@/lib/board";
import { orderFilterEvents, sharedFirst } from "@/lib/deck";
import { slugsOf } from "@/lib/taxonomy/skills";
import { boardExclusions, demoUserIds, listBoardPeople, poolEventsFor } from "@/server/board";
import { deckDetails, nextDeckCards } from "@/server/deck";
import { listEventInterestIds, listUpcomingEvents } from "@/server/events";
import { matchedFirstName } from "@/server/matches";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = parseBoardParams(params);
  // A plain form submit sends every field, empty ones included; keep shared URLs clean.
  if (BOARD_PARAM_KEYS.some((key) => params[key] === "")) redirect(boardHref(parsed));
  const user = await getUser();
  const viewer: Viewer = !user ? "anon" : user.onboarded_at ? "onboarded" : "not-onboarded";
  const deleted = params.deleted !== undefined;
  const events = await listUpcomingEvents();

  // Visitors start on the landing page; any board parameter opens the board itself.
  if (viewer === "anon" && !BOARD_PARAM_KEYS.some((key) => params[key] !== undefined)) {
    after(() => track("board_viewed", { tab: "landing", filtered: false, signed_in: false }, null));
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
        <Outcome params={params} />
        {deleted ? <Notice>Your account has been deleted.</Notice> : null}
        <Landing hackathons={events.slice(0, LANDING_EVENTS)} />
      </main>
    );
  }

  // Members: one deck of person cards, optionally for one event (P1-24).
  if (viewer === "onboarded" && wantsDeck(params)) {
    const eventSlug = parsed.filters.event;
    const [deckData, myEventIds] = await Promise.all([
      nextDeckCards(user!, eventSlug),
      listEventInterestIds(user!.id),
    ]);
    const top = deckData.cards[0];
    const details = top ? await deckDetails(user!.id, top) : null;
    const matchedId = typeof params.matched === "string" ? params.matched : null;
    const matchedName =
      matchedId && /^[0-9a-f-]{36}$/.test(matchedId)
        ? await matchedFirstName(matchedId, user!.id)
        : null;
    after(() =>
      track(
        "board_viewed",
        { tab: "deck", filtered: eventSlug !== null, signed_in: true },
        user!.id,
      ),
    );
    return (
      // Discover sits on a light grey page, like the mockup.
      <main className="flex min-h-[calc(100dvh-3.5rem)] flex-col gap-6 bg-surface px-4 py-6">
        <DeckView
          cards={deckData.cards}
          more={deckData.more}
          details={details}
          expanded={params.more === "1"}
          eventSlug={eventSlug}
          filterEvents={orderFilterEvents(events, myEventIds, eventSlug)}
          params={params}
          matched={matchedName ? { name: matchedName, matchId: matchedId! } : null}
        />
      </main>
    );
  }

  // `/` is the deck for members and the landing page for visitors; keep both on
  // the list (`?view=list`) while they use it.
  const state: BoardState = viewer !== "not-onboarded" ? { ...parsed, view: "list" } : parsed;
  const exclude = await boardExclusions(viewer === "onboarded" ? user!.id : null);

  // Who is going to an event is for members; visitors see a few cards and a sign-in prompt.
  const capped = viewer !== "onboarded" && state.filters.event !== null;
  const people = await listBoardPeople(
    state.filters,
    capped ? VISITOR_LIMIT : state.shown,
    exclude.people,
  );
  const peopleIds = people.rows.map((p) => p.user_id);
  const [demo, going, myEventIds] = await Promise.all([
    demoUserIds(peopleIds),
    viewer === "onboarded" ? poolEventsFor(peopleIds) : Promise.resolve(new Map()),
    viewer === "onboarded" ? listEventInterestIds(user!.id) : Promise.resolve([]),
  ]);

  after(() =>
    track(
      "board_viewed",
      { tab: "people", filtered: hasFilters(state.filters), signed_in: user !== null },
      user?.id ?? null,
    ),
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <Outcome params={params} />

      {deleted ? <Notice>Your account has been deleted.</Notice> : null}

      {viewer === "anon" ? (
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Find someone to build with.
        </h1>
      ) : (
        <h1 className="sr-only">Everyone</h1>
      )}

      <div className="flex flex-wrap items-start justify-end gap-3">
        <BoardFilters
          state={state}
          events={events}
          domains={slugsOf("domains")}
          skills={[...slugsOf("skills"), ...slugsOf("stack")]}
        />
      </div>

      {people.rows.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={
            hasFilters(state.filters) ? "Nobody matches these filters yet." : "Nobody here yet."
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.rows.map((person) => (
            <li key={person.user_id}>
              <PersonCard
                person={person}
                goingTo={
                  viewer === "onboarded"
                    ? sharedFirst(going.get(person.user_id) ?? [], myEventIds)
                    : undefined
                }
                isDemo={demo.has(person.user_id)}
                headingLevel={2}
                actions={
                  <CardActions
                    viewer={viewer}
                    cardPath={`/people/${person.user_id}`}
                    onboarded={
                      <CardAnswerButtons
                        kind="person"
                        targetId={person.user_id}
                        returnTo={boardHref(state)}
                      />
                    }
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}

      {people.hasMore && capped ? (
        <SeeAllPrompt
          viewer={viewer}
          next={boardHref({ ...state, shown: PAGE_SIZE })}
          what="people going to this event"
        />
      ) : people.hasMore ? (
        <Link
          href={boardHref({ ...state, shown: state.shown + PAGE_SIZE })}
          scroll={false}
          className="self-center rounded-lg border border-line px-4 py-2 text-sm"
        >
          Load more
        </Link>
      ) : null}
    </main>
  );
}

import { SearchX } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { CardAnswerButtons } from "@/components/AnswerButtons";
import { BoardFilters } from "@/components/BoardFilters";
import { CardActions, type Viewer } from "@/components/CardActions";
import { DeckView } from "@/components/deck/DeckView";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Landing } from "@/components/landing/Landing";
import { Notice } from "@/components/ui/Notice";
import { IdeaCard } from "@/components/IdeaCard";
import { Outcome } from "@/components/Outcome";
import { PersonCard } from "@/components/PersonCard";
import { SeeAllPrompt } from "@/components/SeeAllPrompt";
import { track } from "@/lib/analytics";
import { getUser } from "@/lib/auth";
import {
  BOARD_PARAM_KEYS,
  boardHref,
  hasFilters,
  PAGE_SIZE,
  parseBoardParams,
  VISITOR_LIMIT,
  wantsDeck,
  type BoardState,
} from "@/lib/board";
import { getConfig } from "@/lib/config";
import { upcomingNycHackathons } from "@/lib/nyc-hackathons";
import { slugsOf } from "@/lib/taxonomy/skills";
import { localDateString } from "@/lib/time";
import { defaultDeckKind, parseDeckKind } from "@/lib/deck";
import { ideaHackathons } from "@/lib/person-card";
import {
  boardExclusions,
  demoIds,
  ideaCounts,
  listBoardIdeas,
  listBoardPeople,
  poolEventsFor,
} from "@/server/board";
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

  // Visitors start on the landing page; any board parameter opens the board itself.
  if (viewer === "anon" && !BOARD_PARAM_KEYS.some((key) => params[key] !== undefined)) {
    after(() => track("board_viewed", { tab: "landing", filtered: false, signed_in: false }, null));
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
        <Outcome params={params} />
        {deleted ? <Notice>Your account has been deleted.</Notice> : null}
        <Landing hackathons={upcomingNycHackathons(localDateString(getConfig().APP_TIMEZONE))} />
      </main>
    );
  }
  const deck = viewer === "onboarded" && wantsDeck(params);
  // `/` is the deck for members and the landing page for visitors; keep both on
  // the list (`?view=list`) while they use it.
  const state: BoardState = viewer !== "not-onboarded" ? { ...parsed, view: "list" } : parsed;

  const [events, exclude] = await Promise.all([
    listUpcomingEvents(),
    boardExclusions(viewer === "onboarded" ? user!.id : null),
  ]);
  const eventNames = new Map(events.map((event) => [event.id, event.name]));

  // Who is going to an event is for members; visitors see a few cards and a sign-in prompt.
  const capped = viewer !== "onboarded" && state.filters.event !== null;
  const shown = capped ? VISITOR_LIMIT : state.shown;
  const ideas =
    !deck && state.tab === "ideas"
      ? await listBoardIdeas(state.filters, shown, exclude.users, exclude.ideas)
      : null;
  const people =
    !deck && state.tab === "people"
      ? await listBoardPeople(state.filters, shown, exclude.people)
      : null;
  const peopleIds = people?.rows.map((p) => p.user_id) ?? [];
  const ownerIds = ideas?.rows.map((i) => i.owner_id) ?? [];
  // Where people are going is for members; visitors see only the 3 per event.
  const [counts, looking, demo] = await Promise.all([
    ideaCounts(peopleIds),
    viewer === "onboarded"
      ? poolEventsFor([...peopleIds, ...ownerIds])
      : Promise.resolve(new Map()),
    demoIds(peopleIds, ideas?.rows.map((i) => i.id) ?? []),
  ]);
  const eventsById = new Map(
    events.map((e) => [e.id, { id: e.id, name: e.name, startDate: e.start_date }]),
  );
  // Members start on the deck that fits their role; ?deck= switches (P1-23).
  const deckKind = parseDeckKind(params.deck) ?? defaultDeckKind(user?.role ?? null);
  const deckData = deck ? await nextDeckCards(user!, state.filters.event, deckKind) : null;
  const topCard = deckData?.cards[0];
  const topDetails = topCard ? await deckDetails(user!.id, topCard) : null;
  const going = deck ? new Set(await listEventInterestIds(user!.id)) : new Set<string>();
  const myEvents = events.filter((event) => going.has(event.id));
  const matchedId = typeof params.matched === "string" ? params.matched : null;
  const matchedName =
    deck && matchedId && /^[0-9a-f-]{36}$/.test(matchedId)
      ? await matchedFirstName(matchedId, user!.id)
      : null;
  const rows = ideas?.rows ?? people?.rows ?? [];
  const hasMore = (ideas ?? people)?.hasMore ?? false;

  after(() =>
    track(
      "board_viewed",
      {
        tab: deck ? "deck" : state.tab,
        filtered: hasFilters(state.filters),
        signed_in: user !== null,
      },
      user?.id ?? null,
    ),
  );

  const tabHref = (tab: BoardState["tab"]) => boardHref({ ...state, tab, shown: PAGE_SIZE });

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      {deckData ? (
        <DeckView
          kind={deckKind}
          cards={deckData.cards}
          more={deckData.more}
          details={topDetails}
          expanded={params.more === "1"}
          eventSlug={state.filters.event}
          eventNames={eventNames}
          myEvents={myEvents}
          params={params}
          matched={matchedName ? { name: matchedName, matchId: matchedId! } : null}
        />
      ) : (
        <>
          <Outcome params={params} />

          {deleted ? <Notice>Your account has been deleted.</Notice> : null}

          {viewer === "anon" ? (
            <section className="flex flex-col items-start gap-4 py-8">
              <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
                Find someone to build with.
              </h1>
              <Button
                href={`/join?${new URLSearchParams({ next: "/onboarding", from: "hero" })}`}
                prefetch={false}
                size="lg"
              >
                Join with your Cornell email
              </Button>
            </section>
          ) : (
            <h1 className="sr-only">Board</h1>
          )}

          <div className="flex flex-wrap items-start justify-between gap-3">
            <nav aria-label="Board tabs" className="flex gap-1 rounded-xl bg-surface p-1">
              {(["ideas", "people"] as const).map((tab) => (
                <Link
                  key={tab}
                  href={tabHref(tab)}
                  aria-current={state.tab === tab ? "page" : undefined}
                  className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
                    state.tab === tab ? "bg-bg text-ink shadow-sm" : "text-muted"
                  }`}
                >
                  {tab === "ideas" ? "Ideas" : "Builders"}
                </Link>
              ))}
            </nav>
            <BoardFilters
              state={state}
              events={events}
              domains={slugsOf("domains")}
              skills={[...slugsOf("skills"), ...slugsOf("stack")]}
            />
          </div>

          <h2 className="sr-only">{state.tab === "ideas" ? "Ideas" : "Builders"}</h2>
          {rows.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={
                hasFilters(state.filters)
                  ? "Nothing matches these filters yet."
                  : "Nothing here yet."
              }
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ideas?.rows.map((idea) => (
                <li key={idea.id}>
                  <IdeaCard
                    idea={idea}
                    eventName={idea.event_id ? eventNames.get(idea.event_id) : null}
                    hackathons={
                      viewer === "onboarded"
                        ? ideaHackathons(
                            (idea.event_id && eventsById.get(idea.event_id)) || null,
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
                          <CardAnswerButtons
                            kind="idea"
                            targetId={idea.id}
                            returnTo={boardHref(state)}
                          />
                        }
                      />
                    }
                  />
                </li>
              ))}
              {people?.rows.map((person) => (
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

          {hasMore && capped ? (
            <SeeAllPrompt
              viewer={viewer}
              next={boardHref({ ...state, shown: PAGE_SIZE })}
              what={state.tab === "ideas" ? "ideas for this event" : "builders going to this event"}
            />
          ) : hasMore ? (
            <Link
              href={boardHref({ ...state, shown: state.shown + PAGE_SIZE })}
              scroll={false}
              className="self-center rounded-lg border border-line px-4 py-2 text-sm"
            >
              Load more
            </Link>
          ) : null}
        </>
      )}
    </main>
  );
}

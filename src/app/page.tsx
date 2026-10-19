import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { CardAnswerButtons } from "@/components/AnswerButtons";
import { BoardFilters } from "@/components/BoardFilters";
import { CardActions, type Viewer } from "@/components/CardActions";
import { DeckView } from "@/components/deck/DeckView";
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
import { slugsOf } from "@/lib/taxonomy/skills";
import { excludedUserIds, listBoardIdeas, listBoardPeople } from "@/server/board";
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
  const deck = viewer === "onboarded" && wantsDeck(params);
  // Members reach the list through "Browse all"; keep them on it while they use it.
  const state: BoardState = viewer === "onboarded" ? { ...parsed, view: "list" } : parsed;

  const [events, exclude] = await Promise.all([
    listUpcomingEvents(),
    excludedUserIds(viewer === "onboarded" ? user!.id : null),
  ]);
  const eventNames = new Map(events.map((event) => [event.id, event.name]));

  // Who is going to an event is for members; visitors see a few cards and a sign-in prompt.
  const capped = viewer !== "onboarded" && state.filters.event !== null;
  const shown = capped ? VISITOR_LIMIT : state.shown;
  const ideas =
    !deck && state.tab === "ideas" ? await listBoardIdeas(state.filters, shown, exclude) : null;
  const people =
    !deck && state.tab === "people" ? await listBoardPeople(state.filters, shown, exclude) : null;
  const deckData = deck ? await nextDeckCards(user!, state.filters.event) : null;
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
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          HackaMatch
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/events" className="underline">
            Events
          </Link>
          {viewer === "onboarded" ? (
            <>
              {deck ? (
                <Link href="/?view=list" className="underline">
                  Browse all
                </Link>
              ) : (
                <Link href="/" className="underline">
                  Discover
                </Link>
              )}
              <Link href="/ideas/new" className="underline">
                Post an idea
              </Link>
              <Link href="/matches" className="underline">
                Matches
              </Link>
              <Link href="/me" className="underline">
                Profile
              </Link>
            </>
          ) : viewer === "not-onboarded" ? (
            <Link href="/onboarding" className="underline">
              Finish joining
            </Link>
          ) : (
            <Link href="/login" className="underline">
              Sign in
            </Link>
          )}
        </nav>
      </header>

      {deckData ? (
        <DeckView
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

          {deleted ? (
            <p
              role="status"
              className="rounded-lg bg-neutral-100 px-4 py-3 text-sm dark:bg-neutral-900"
            >
              Your account has been deleted.
            </p>
          ) : null}

          {viewer === "anon" ? (
            <section className="flex flex-col gap-3 py-6">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Find someone to build your idea with, or an idea worth your weekend.
              </h1>
              <p className="text-neutral-600 dark:text-neutral-400">
                For Cornell students. One sentence to join; matches come to you.
              </p>
              <Link
                href={`/join?${new URLSearchParams({ next: "/onboarding", from: "hero" })}`}
                prefetch={false}
                className="self-start rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
              >
                Join with your Cornell email
              </Link>
            </section>
          ) : (
            <h1 className="sr-only">Board</h1>
          )}

          <nav
            aria-label="Board tabs"
            className="flex gap-2 border-b border-neutral-200 dark:border-neutral-800"
          >
            {(["ideas", "people"] as const).map((tab) => (
              <Link
                key={tab}
                href={tabHref(tab)}
                aria-current={state.tab === tab ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  state.tab === tab
                    ? "border-neutral-900 dark:border-neutral-100"
                    : "border-transparent text-neutral-500"
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

          <h2 className="sr-only">{state.tab === "ideas" ? "Ideas" : "Builders"}</h2>
          {rows.length === 0 ? (
            <p className="py-12 text-center text-neutral-500">
              {hasFilters(state.filters)
                ? "Nothing matches these filters yet."
                : "Nothing here yet."}
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ideas?.rows.map((idea) => (
                <li key={idea.id}>
                  <IdeaCard
                    idea={idea}
                    eventName={idea.event_id ? eventNames.get(idea.event_id) : null}
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
              className="self-center rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
            >
              Load more
            </Link>
          ) : null}
        </>
      )}
    </main>
  );
}

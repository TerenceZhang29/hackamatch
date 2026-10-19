import Link from "next/link";
import { answerCard, undoPassAction } from "@/app/actions/respond";
import { Outcome } from "@/components/Outcome";
import { deckHref, leftLabel } from "@/lib/deck";
import type { DeckCard, DeckDetails } from "@/server/deck";
import { DeckCardView } from "./DeckCardView";
import { Swipe } from "./Swipe";

const bigButton = "flex-1 rounded-xl px-4 py-3 text-base font-medium";

type Params = Record<string, string | string[] | undefined>;

/** Pass / Interested for the card on top, as a plain form that comes back to the deck. */
function AnswerBar({ card, returnTo }: { card: DeckCard; returnTo: string }) {
  const kind = card.kind;
  const targetId = card.kind === "idea" ? card.idea.id : card.person.user_id;
  return (
    <form
      action={answerCard}
      className="sticky bottom-0 -mx-1 flex gap-3 bg-[var(--background)] px-1 py-3"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        id="deck-pass"
        type="submit"
        name="response"
        value="pass"
        className={`${bigButton} border border-neutral-300 dark:border-neutral-700`}
      >
        Pass
      </button>
      <button
        id="deck-interested"
        type="submit"
        name="response"
        value="interested"
        className={`${bigButton} bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900`}
      >
        Interested
      </button>
    </form>
  );
}

/** Right after a Pass: say so, and offer to take it back (decision 4: the last Pass only). */
function UndoPass({ matchId, returnTo }: { matchId: string; returnTo: string }) {
  return (
    <form
      action={undoPassAction}
      role="status"
      className="flex items-center justify-center gap-2 text-sm text-neutral-500"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      Passed.
      <button
        type="submit"
        className="font-medium text-neutral-900 underline dark:text-neutral-100"
      >
        ↶ Undo
      </button>
    </form>
  );
}

/** The deck URL with the card on top expanded. */
function withMore(href: string): string {
  return href.includes("?") ? `${href}&more=1` : `${href}?more=1`;
}

/** "You matched with Sofia!" between cards, after an Interested made a mutual match. */
function Matched({ name, matchId, next }: { name: string; matchId: string; next: string }) {
  return (
    <section
      aria-labelledby="matched-heading"
      className="flex flex-col items-center gap-4 rounded-2xl border border-green-600 bg-green-50 px-6 py-10 text-center dark:bg-green-950"
    >
      <h2 id="matched-heading" className="text-2xl font-bold">
        You matched with {name}!
      </h2>
      <p className="text-neutral-600 dark:text-neutral-400">
        We&apos;ve emailed you both each other&apos;s contact details.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href={`/matches/${matchId}`}
          className="rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Say hi
        </Link>
        <Link
          href={next}
          className="rounded-xl border border-neutral-300 px-5 py-3 dark:border-neutral-700"
        >
          Keep going
        </Link>
      </div>
    </section>
  );
}

/** Narrow the deck to one event's pool (decision 3): only events the viewer is going to. */
function EventChips({
  events,
  current,
}: {
  events: { slug: string; name: string }[];
  current: string | null;
}) {
  if (events.length === 0) return null;
  const chipClass = (on: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-sm ${
      on
        ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
        : "border-neutral-300 dark:border-neutral-700"
    }`;
  return (
    <nav aria-label="Whose cards" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <Link
        href="/"
        aria-current={current === null ? "page" : undefined}
        className={chipClass(current === null)}
      >
        Everyone
      </Link>
      {events.map((event) => (
        <Link
          key={event.slug}
          href={deckHref(event.slug)}
          aria-current={current === event.slug ? "page" : undefined}
          className={chipClass(current === event.slug)}
        >
          {event.name}
        </Link>
      ))}
    </nav>
  );
}

/** The end of the deck. */
function Empty({ eventName }: { eventName: string | null }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-200 px-6 py-12 text-center dark:border-neutral-800">
      <h2 className="text-xl font-semibold">
        {eventName ? `You've seen everyone going to ${eventName}` : "You've seen everyone for now"}
      </h2>
      {eventName ? (
        <Link href="/" className="text-sm underline">
          See everyone else
        </Link>
      ) : null}
      <p className="text-neutral-600 dark:text-neutral-400">
        New people join every day. Meanwhile:
      </p>
      <ul className="flex flex-wrap justify-center gap-4 text-sm">
        <li>
          <Link href="/events" className="underline">
            Upcoming hackathons
          </Link>
        </li>
        <li>
          <Link href="/ideas/new" className="underline">
            Post an idea
          </Link>
        </li>
        <li>
          <Link href="/matches" className="underline">
            Your matches
          </Link>
        </li>
      </ul>
    </section>
  );
}

/**
 * One card at a time for members (docs/plans/card-deck.md). Answering posts
 * the card's form and comes back here, where the next card is on top.
 */
export function DeckView({
  cards,
  more,
  details,
  expanded,
  eventSlug,
  eventNames,
  myEvents,
  params,
  matched,
}: {
  cards: DeckCard[];
  more: boolean;
  /** Extra details for the card on top (null when the deck is empty). */
  details: DeckDetails | null;
  /** `?more=1`: the card on top shows its full profile. */
  expanded: boolean;
  eventSlug: string | null;
  eventNames: Map<string, string>;
  /** Upcoming events the viewer is going to, for the chips. */
  myEvents: { slug: string; name: string }[];
  params: Params;
  /** Set right after a mutual match: show the celebration before the next card. */
  matched: { name: string; matchId: string } | null;
}) {
  const here = deckHref(eventSlug);
  const card = cards[0];
  const passed = typeof params.passed === "string" ? params.passed : null;
  const undoable = passed && /^[0-9a-f-]{36}$/.test(passed) ? passed : null;
  // The Undo line replaces the "Passed" banner.
  const { passed: _passed, ...outcome } = params;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Discover</h1>
        {card && !matched ? <span>{leftLabel(cards.length, more)}</span> : null}
      </div>
      <EventChips events={myEvents} current={eventSlug} />
      {matched ? null : <Outcome params={outcome} />}
      {matched ? (
        <Matched name={matched.name} matchId={matched.matchId} next={here} />
      ) : card ? (
        <>
          <Swipe
            key={card.kind === "idea" ? card.idea.id : card.person.user_id}
            moreHref={withMore(here)}
            expanded={expanded}
          >
            <DeckCardView
              card={card}
              details={details!}
              eventNames={eventNames}
              expanded={expanded}
              moreHref={withMore(here)}
              lessHref={here}
            />
          </Swipe>
          <p className="hidden text-center text-xs text-neutral-500 sm:block">
            Tip: ← Pass · → Interested · ↑ Full profile
          </p>
          <AnswerBar card={card} returnTo={here} />
          {undoable ? <UndoPass matchId={undoable} returnTo={here} /> : null}
        </>
      ) : (
        <>
          <Empty
            eventName={
              myEvents.find((e) => e.slug === eventSlug)?.name ?? (eventSlug ? "this event" : null)
            }
          />
          {undoable ? <UndoPass matchId={undoable} returnTo={here} /> : null}
        </>
      )}
    </div>
  );
}

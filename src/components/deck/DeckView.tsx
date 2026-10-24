import {
  CalendarDays,
  Check,
  Handshake,
  LayoutGrid,
  PartyPopper,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { answerCard, undoPassAction } from "@/app/actions/respond";
import { Outcome } from "@/components/Outcome";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { deckHref, leftLabel, parsePassToken } from "@/lib/deck";
import type { BoardPerson } from "@/server/board";
import type { DeckDetails } from "@/server/deck";
import { DeckCardView } from "./DeckCardView";
import { Swipe } from "./Swipe";

type Params = Record<string, string | string[] | undefined>;

const round = "inline-flex items-center justify-center rounded-full transition active:scale-95";

/**
 * ✕ / ♥ for the card on top, as one plain form that comes back to the deck.
 * Undo (the last Pass only) sits beside them when there's one to take back.
 */
function AnswerBar({
  person,
  returnTo,
  undoable,
}: {
  person: BoardPerson;
  returnTo: string;
  undoable: string | null;
}) {
  return (
    // Above the bottom tab bar on phones.
    <div className="sticky bottom-16 z-10 flex items-center justify-center gap-7 bg-surface/90 py-3 backdrop-blur sm:bottom-0">
      {undoable ? (
        <form action={undoPassAction}>
          <input type="hidden" name="passed" value={undoable} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            aria-label="Undo"
            title="Undo"
            className="inline-flex size-11 items-center justify-center rounded-full bg-surface text-muted transition active:scale-95"
          >
            <RotateCcw aria-hidden="true" className="size-5" />
          </button>
        </form>
      ) : null}
      <form action={answerCard} className="flex items-center gap-7">
        <input type="hidden" name="kind" value="person" />
        <input type="hidden" name="targetId" value={person.user_id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          id="deck-pass"
          type="submit"
          name="response"
          value="pass"
          aria-label="Pass"
          title="Pass"
          className={`${round} size-16 bg-bg text-ink shadow-[0_6px_16px_rgba(22,22,26,0.12)]`}
        >
          <X aria-hidden="true" className="size-7" strokeWidth={2.25} />
        </button>
        <button
          id="deck-interested"
          type="submit"
          name="response"
          value="interested"
          aria-label="Interested"
          title="Interested"
          className={`${round} size-[76px] bg-accent text-accent-ink shadow-[0_10px_22px_rgba(79,70,229,0.35)]`}
        >
          <Handshake aria-hidden="true" className="size-[34px]" strokeWidth={2} />
        </button>
      </form>
    </div>
  );
}

/** The deck URL with the card on top expanded. */
function withMore(href: string): string {
  return href.includes("?") ? `${href}&more=1` : `${href}?more=1`;
}

/**"It's a match" between cards, after an Interested made a mutual match. */
function Matched({ name, matchId, next }: { name: string; matchId: string; next: string }) {
  return (
    <section
      aria-labelledby="matched-heading"
      className="flex flex-col items-center gap-5 rounded-3xl bg-success-soft px-6 py-12 text-center"
    >
      <PartyPopper aria-hidden="true" className="size-10 text-success-ink" />
      <Avatar name={name} size={72} />
      <h2 id="matched-heading" className="text-2xl font-bold">
        You matched with {name}!
      </h2>
      <div className="flex flex-wrap justify-center gap-3">
        <Button href={`/matches/${matchId}`} size="lg">
          Say hi
        </Button>
        <Button href={next} size="lg" variant="ghost">
          Keep going
        </Button>
      </div>
    </section>
  );
}

/**
 * The hackathon filter (P1-24): "All hackathons" pinned at the left, then the
 * upcoming hackathons (the selected one, then the viewer's own, then the
 * rest), which scroll sideways. Plain links, so it works without JavaScript.
 */
function HackathonFilter({
  events,
  current,
  left,
}: {
  events: { slug: string; name: string }[];
  current: string | null;
  left: string | null;
}) {
  const chip = (on: boolean) =>
    `inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-medium ${
      on ? "bg-ink text-bg" : "bg-bg text-ink ring-1 ring-line hover:bg-surface"
    }`;
  return (
    // A white strip across the top of the grey Discover page (the mockup's filter bar).
    <div className="-mx-4 -mt-6 flex flex-col gap-2 border-b border-line bg-bg px-4 pt-2.5 pb-2 sm:mx-0 sm:mt-0 sm:rounded-2xl sm:border">
      <nav aria-label="Filter by hackathon" className="flex items-center gap-2">
        <Link
          href={deckHref(null)}
          aria-current={current === null ? "page" : undefined}
          className={chip(current === null)}
        >
          All hackathons
        </Link>
        {events.length ? (
          <>
            <span aria-hidden="true" className="h-6 w-px shrink-0 bg-line" />
            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pr-6 [mask-image:linear-gradient(to_right,#000_85%,transparent)] [scrollbar-width:none]">
              {events.map((event) => (
                <Link
                  key={event.slug}
                  href={deckHref(event.slug)}
                  aria-current={current === event.slug ? "page" : undefined}
                  className={chip(current === event.slug)}
                >
                  {current === event.slug ? (
                    <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                  ) : null}
                  {event.name}
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </nav>
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>{left ?? ""}</span>
        <Link href="/?view=list" className="flex items-center gap-1 font-medium hover:text-ink">
          <LayoutGrid aria-hidden="true" className="size-3.5" />
          Browse all
        </Link>
      </div>
    </div>
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
  filterEvents,
  params,
  matched,
}: {
  cards: BoardPerson[];
  more: boolean;
  /** Extra details for the card on top (null when the deck is empty). */
  details: DeckDetails | null;
  /** `?more=1`: the card on top shows its full profile. */
  expanded: boolean;
  eventSlug: string | null;
  /** Upcoming events for the filter, in order (orderFilterEvents). */
  filterEvents: { slug: string; name: string }[];
  params: Params;
  /** Set right after a mutual match: show the celebration before the next card. */
  matched: { name: string; matchId: string } | null;
}) {
  const here = deckHref(eventSlug);
  const person = cards[0];
  const passed = typeof params.passed === "string" ? params.passed : null;
  const undoable = parsePassToken(passed) ? passed : null;
  const eventName =
    filterEvents.find((e) => e.slug === eventSlug)?.name ?? (eventSlug ? "this event" : null);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="sr-only">Discover</h1>
      <HackathonFilter
        events={filterEvents}
        current={eventSlug}
        left={person && !matched ? leftLabel(cards.length, more) : null}
      />
      {matched ? null : <Outcome params={params} />}
      {matched ? (
        <Matched name={matched.name} matchId={matched.matchId} next={here} />
      ) : person ? (
        <>
          <Swipe key={person.user_id} moreHref={withMore(here)} expanded={expanded}>
            <div className="relative pb-3">
              {/* The next card, peeking out behind this one. */}
              {cards.length > 1 ? (
                <div
                  aria-hidden="true"
                  className="absolute inset-x-[18px] top-3.5 bottom-0 rounded-[28px] bg-line"
                />
              ) : null}
              <div className="relative">
                <DeckCardView
                  person={person}
                  details={details!}
                  expanded={expanded}
                  moreHref={withMore(here)}
                  lessHref={here}
                />
              </div>
            </div>
          </Swipe>
          <AnswerBar person={person} returnTo={here} undoable={undoable} />
        </>
      ) : (
        <>
          <EmptyState
            icon={Sparkles}
            title={
              eventName
                ? `You've seen everyone going to ${eventName}`
                : "You've seen everyone for now"
            }
          >
            {eventName ? (
              <Button href={deckHref(null)} variant="primary">
                All hackathons
              </Button>
            ) : (
              <Button href="/events" variant="primary">
                <CalendarDays aria-hidden="true" className="size-4" /> Events
              </Button>
            )}
          </EmptyState>
          {undoable ? (
            <form action={undoPassAction} className="flex justify-center">
              <input type="hidden" name="passed" value={undoable} />
              <input type="hidden" name="returnTo" value={here} />
              <Button type="submit" variant="ghost" size="sm">
                <RotateCcw aria-hidden="true" className="size-4" /> Undo
              </Button>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}

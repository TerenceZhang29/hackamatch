import {
  CalendarDays,
  Heart,
  LayoutGrid,
  Lightbulb,
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
import { deckHref, leftLabel } from "@/lib/deck";
import type { DeckCard, DeckDetails } from "@/server/deck";
import { DeckCardView } from "./DeckCardView";
import { Swipe } from "./Swipe";

type Params = Record<string, string | string[] | undefined>;

const round =
  "inline-flex size-16 items-center justify-center rounded-full shadow-sm transition active:scale-95";

/**
 * ✕ / ♥ for the card on top, as one plain form that comes back to the deck.
 * Undo (the last Pass only) sits beside them when there's one to take back.
 */
function AnswerBar({
  card,
  returnTo,
  undoable,
}: {
  card: DeckCard;
  returnTo: string;
  undoable: string | null;
}) {
  const targetId = card.kind === "idea" ? card.idea.id : card.person.user_id;
  return (
    // Above the bottom tab bar on phones.
    <div className="sticky bottom-16 z-10 flex items-center justify-center gap-6 bg-bg/90 py-3 backdrop-blur sm:bottom-0">
      {undoable ? (
        <form action={undoPassAction}>
          <input type="hidden" name="matchId" value={undoable} />
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
      <form action={answerCard} className="flex items-center gap-6">
        <input type="hidden" name="kind" value={card.kind} />
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <button
          id="deck-pass"
          type="submit"
          name="response"
          value="pass"
          aria-label="Pass"
          title="Pass"
          className={`${round} bg-surface text-ink`}
        >
          <X aria-hidden="true" className="size-7" strokeWidth={2.4} />
        </button>
        <button
          id="deck-interested"
          type="submit"
          name="response"
          value="interested"
          aria-label="Interested"
          title="Interested"
          className={`${round} bg-accent text-accent-ink`}
        >
          <Heart aria-hidden="true" className="size-7" strokeWidth={2.4} />
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

/** Narrow the deck to one event's pool: only events the viewer is going to. */
function EventChips({
  events,
  current,
  left,
}: {
  events: { slug: string; name: string }[];
  current: string | null;
  left: string | null;
}) {
  // Whole chips that wrap onto new lines, never shrunk or cut.
  const chip = (on: boolean) =>
    `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
      on ? "bg-ink text-bg" : "bg-surface text-muted hover:text-ink"
    }`;
  return (
    <div className="flex flex-col gap-2">
      {events.length ? (
        <nav aria-label="Whose cards" className="flex flex-wrap gap-2">
          <Link
            href="/"
            aria-current={current === null ? "page" : undefined}
            className={chip(current === null)}
          >
            Everyone
          </Link>
          {events.map((event) => (
            <Link
              key={event.slug}
              href={deckHref(event.slug)}
              aria-current={current === event.slug ? "page" : undefined}
              className={chip(current === event.slug)}
            >
              {event.name}
            </Link>
          ))}
        </nav>
      ) : null}
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
  const eventName =
    myEvents.find((e) => e.slug === eventSlug)?.name ?? (eventSlug ? "this event" : null);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="sr-only">Discover</h1>
      <EventChips
        events={myEvents}
        current={eventSlug}
        left={card && !matched ? leftLabel(cards.length, more) : null}
      />
      {matched ? null : <Outcome params={params} />}
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
          <AnswerBar card={card} returnTo={here} undoable={undoable} />
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
              <Button href="/" variant="outline">
                Everyone
              </Button>
            ) : (
              <>
                <Button href="/events" variant="outline">
                  <CalendarDays aria-hidden="true" className="size-4" /> Events
                </Button>
                <Button href="/ideas/new" variant="outline">
                  <Lightbulb aria-hidden="true" className="size-4" /> Post an idea
                </Button>
              </>
            )}
          </EmptyState>
          {undoable ? (
            <form action={undoPassAction} className="flex justify-center">
              <input type="hidden" name="matchId" value={undoable} />
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

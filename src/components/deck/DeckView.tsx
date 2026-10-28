"use client";

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
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { answerCard, undoPassAction } from "@/app/actions/respond";
import type { DeckAnswer } from "@/app/api/deck/route";
import { Outcome } from "@/components/Outcome";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DECK_DETAILS_WINDOW, deckHref, leftLabel, parsePassToken } from "@/lib/deck";
import type { BoardPerson } from "@/server/board";
import type { DeckDetails } from "@/server/deck";
import { DeckCardView } from "./DeckCardView";
import { Swipe } from "./Swipe";

type Params = Record<string, string | string[] | undefined>;

const round = "inline-flex items-center justify-center rounded-full transition active:scale-95";

/**
 * ✕ / ♥ for the card on top, as one plain form that comes back to the deck;
 * with JavaScript, `onAnswer` / `onUndo` take the submit instead (DeckView).
 * Undo (the last Pass only) sits beside them when there's one to take back.
 * They float over a fade, not a solid strip, so the card shows through above
 * them; the bar keeps its place after the card, so scrolling to the end shows
 * the whole card clear of the buttons.
 */
function AnswerBar({
  person,
  returnTo,
  undoable,
  onAnswer,
  onUndo,
}: {
  person: BoardPerson;
  returnTo: string;
  undoable: string | null;
  onAnswer: (event: React.FormEvent<HTMLFormElement>) => void;
  onUndo: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    // Above the bottom tab bar on phones.
    <div className="pointer-events-none sticky bottom-16 z-10 -mx-4 -mt-6 flex items-center justify-center gap-6 bg-[linear-gradient(to_bottom,transparent,var(--color-surface)_60%)] px-4 pt-9 pb-3 sm:bottom-0 sm:gap-7">
      {undoable ? (
        <form action={undoPassAction} onSubmit={onUndo}>
          <input type="hidden" name="passed" value={undoable} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            aria-label="Undo"
            title="Undo"
            className="pointer-events-auto inline-flex size-11 items-center justify-center rounded-full bg-bg text-muted shadow-[0_4px_12px_rgba(22,22,26,0.1)] transition active:scale-95"
          >
            <RotateCcw aria-hidden="true" className="size-5" />
          </button>
        </form>
      ) : null}
      <form
        action={answerCard}
        onSubmit={onAnswer}
        className="pointer-events-auto flex items-center gap-6 sm:gap-7"
      >
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
          className={`${round} size-14 bg-bg text-ink shadow-[0_6px_16px_rgba(22,22,26,0.12)] sm:size-16`}
        >
          <X aria-hidden="true" className="size-6 sm:size-7" strokeWidth={2.25} />
        </button>
        <button
          id="deck-interested"
          type="submit"
          name="response"
          value="interested"
          aria-label="Interested"
          title="Interested"
          className={`${round} size-16 bg-accent text-accent-ink shadow-[0_10px_22px_rgba(79,70,229,0.35)] sm:size-[76px]`}
        >
          <Handshake aria-hidden="true" className="size-[30px] sm:size-[34px]" strokeWidth={2} />
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
function Matched({
  name,
  matchId,
  next,
  onDone,
}: {
  name: string;
  matchId: string;
  next: string;
  onDone: () => void;
}) {
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
        <Button
          href={next}
          size="lg"
          variant="ghost"
          onClick={(event) => {
            event.preventDefault();
            onDone();
          }}
        >
          Keep going
        </Button>
      </div>
    </section>
  );
}

/**
 * The hackathon filter (P1-24): "All hackathons" pinned at the left, then the
 * upcoming hackathons (the selected one, then the viewer's own, then the
 * rest), which scroll sideways, then Browse all. One row, so the card gets
 * the height (option 2 of the phone fix); the selected chip shows how many
 * are left. Plain links, so it works without JavaScript.
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
  const count = left ? <span className="font-normal opacity-70">· {left}</span> : null;
  return (
    // A white strip across the top of the grey Discover page (the mockup's filter bar).
    <div className="-mx-4 -mt-6 flex items-center gap-2 border-b border-line bg-bg px-4 py-2 sm:mx-0 sm:mt-0 sm:rounded-2xl sm:border">
      <nav aria-label="Filter by hackathon" className="flex min-w-0 flex-1 items-center gap-2">
        <Link
          href={deckHref(null)}
          aria-current={current === null ? "page" : undefined}
          className={chip(current === null)}
        >
          {/* "All" on phones; screen readers always hear "All hackathons". */}
          <span>
            All<span className="max-sm:sr-only"> hackathons</span>
          </span>
          {current === null ? count : null}
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
                  {current === event.slug ? count : null}
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </nav>
      <Link
        href="/?view=list"
        title="Browse all"
        className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-full bg-surface text-ink hover:bg-surface-2"
      >
        <LayoutGrid aria-hidden="true" className="size-4" />
        <span className="sr-only">Browse all</span>
      </Link>
    </div>
  );
}

/** Calls the deck's route (src/app/api/deck/route.ts); rejects unless it answers 200. */
async function deckApi<T>(body: object): Promise<T> {
  const response = await fetch("/api/deck", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`deck: ${response.status}`);
  return response.json() as Promise<T>;
}

/** "Jordan" from "Jordan L.", for "You matched with …". */
function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

/**
 * One card at a time for members (docs/plans/card-deck.md). With JavaScript,
 * answering shows the next card straight away and saves the answer in the
 * background (src/app/api/deck/route.ts); the details of the next few cards
 * are fetched ahead. Without it, each answer posts the card's form and comes back here,
 * where the next card is on top.
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
  /** Extra details for the first cards (DECK_DETAILS_WINDOW), by user id. */
  details: Record<string, DeckDetails>;
  /** `?more=1`: the card on top shows its full profile. */
  expanded: boolean;
  eventSlug: string | null;
  /** Upcoming events for the filter, in order (orderFilterEvents). */
  filterEvents: { slug: string; name: string }[];
  params: Params;
  /** Set right after a mutual match: show the celebration before the next card. */
  matched: { name: string; matchId: string } | null;
}) {
  const router = useRouter();
  const here = deckHref(eventSlug);
  const [queue, setQueue] = useState(cards);
  const [known, setKnown] = useState(details);
  const [open, setOpen] = useState(expanded);
  const [outcome, setOutcome] = useState<Params>(params);
  const [celebrate, setCelebrate] = useState(matched);
  // The last Pass, to undo. `person` is set when it was made on this screen.
  const [undo, setUndo] = useState<{ token: string; person?: BoardPerson } | null>(() => {
    const passed = typeof params.passed === "string" ? params.passed : null;
    return parsePassToken(passed) ? { token: passed! } : null;
  });
  const fetching = useRef(new Set<string>());
  // Counts answers, so a slow reply doesn't offer Undo after a newer answer.
  const answered = useRef(0);

  const person = queue[0];
  const eventName =
    filterEvents.find((e) => e.slug === eventSlug)?.name ?? (eventSlug ? "this event" : null);

  // Fetch the details of the next few cards before they reach the top.
  useEffect(() => {
    const missing = queue
      .slice(0, DECK_DETAILS_WINDOW)
      .map((p) => p.user_id)
      .filter((id) => !known[id] && !fetching.current.has(id));
    if (missing.length === 0) return;
    for (const id of missing) fetching.current.add(id);
    deckApi<Record<string, DeckDetails>>({ op: "details", userIds: missing })
      .then((fetched) => setKnown((k) => ({ ...k, ...fetched })))
      .catch(() => {})
      .finally(() => {
        for (const id of missing) fetching.current.delete(id);
      });
  }, [queue, known]);

  // Past the cards this page loaded, but there are more: load the next batch.
  useEffect(() => {
    if (!person && more) router.refresh();
  }, [person, more, router]);

  /** Shows `url` without a server render. */
  const show = (url: string) => window.history.replaceState(null, "", url);

  const toggle = (next: boolean) => {
    setOpen(next);
    show(next ? withMore(here) : here);
  };

  const putBack = (card: BoardPerson) =>
    setQueue((q) => [card, ...q.filter((p) => p.user_id !== card.user_id)]);

  function onAnswer(event: React.FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const response = submitter?.value;
    if (!person || (response !== "pass" && response !== "interested")) return;
    event.preventDefault();
    const card = person;
    const mine = ++answered.current;
    setQueue((q) => q.filter((p) => p.user_id !== card.user_id));
    setOpen(false);
    setUndo(null);
    setOutcome(response === "pass" ? { passed: "1" } : { sent: "1" });
    show(here);
    window.scrollTo({ top: 0 });
    deckApi<DeckAnswer>({ op: "answer", targetId: card.user_id, response }).then(
      (result) => {
        if (!result.ok) {
          if (result.error !== "unavailable") putBack(card);
          setOutcome({ error: result.error });
        } else if (result.response === "pass") {
          if (mine === answered.current) setUndo({ token: result.passed, person: card });
        } else if (result.matchId) {
          setCelebrate({ name: firstNameOf(card.display_name), matchId: result.matchId });
        }
      },
      () => {
        putBack(card);
        setOutcome({ error: "failed" });
      },
    );
  }

  function onUndo(event: React.FormEvent<HTMLFormElement>) {
    // A Pass from before this page loaded: the form post brings its card back.
    const card = undo?.person;
    if (!undo || !card) return;
    event.preventDefault();
    const token = undo.token;
    ++answered.current;
    setUndo(null);
    setOutcome({});
    putBack(card);
    deckApi<{ ok: boolean }>({ op: "undo", passed: token }).then(
      ({ ok }) => {
        if (ok) return;
        setQueue((q) => q.filter((p) => p.user_id !== card.user_id));
        setOutcome({ error: "failed" });
      },
      () => {
        setQueue((q) => q.filter((p) => p.user_id !== card.user_id));
        setOutcome({ error: "failed" });
      },
    );
  }

  const undoable = undo?.token ?? null;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="sr-only">Discover</h1>
      <HackathonFilter
        events={filterEvents}
        current={eventSlug}
        left={person && !celebrate ? leftLabel(queue.length, more) : null}
      />
      {celebrate ? null : <Outcome params={outcome} />}
      {celebrate ? (
        <Matched
          name={celebrate.name}
          matchId={celebrate.matchId}
          next={here}
          onDone={() => {
            setCelebrate(null);
            setOutcome({});
            show(here);
          }}
        />
      ) : person ? (
        <>
          <Swipe key={person.user_id} onOpen={() => toggle(true)} expanded={open}>
            <div className="relative pb-3">
              {/* The next card, peeking out behind this one. */}
              {queue.length > 1 ? (
                <div
                  aria-hidden="true"
                  className="absolute inset-x-[18px] top-3.5 bottom-0 rounded-[28px] bg-line"
                />
              ) : null}
              <div className="relative">
                <DeckCardView
                  person={person}
                  // Shown without its hackathons for a moment if answers outran the fetch.
                  details={known[person.user_id] ?? NO_DETAILS}
                  expanded={open}
                  moreHref={withMore(here)}
                  lessHref={here}
                  onToggle={toggle}
                />
              </div>
            </div>
          </Swipe>
          <AnswerBar
            person={person}
            returnTo={here}
            undoable={undoable}
            onAnswer={onAnswer}
            onUndo={onUndo}
          />
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
            <form action={undoPassAction} onSubmit={onUndo} className="flex justify-center">
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

const NO_DETAILS: DeckDetails = { viewerEventIds: [], personEvents: [], isDemo: false };

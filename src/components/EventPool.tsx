import Link from "next/link";
import { eventPoolAction } from "@/app/actions/event-pool";
import type { EventMatch, EventPool } from "@/server/events";

const primaryButton =
  "rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900";
const secondaryButton = "rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700";

/** One button that posts a pool choice for an event. */
function Choice({
  eventId,
  choice,
  returnTo,
  confirmed,
  className,
  children,
}: {
  eventId: string;
  choice: "going" | "not-going" | "keep-looking" | "have-team" | "looking-again";
  returnTo: string;
  confirmed?: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <form action={eventPoolAction}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="choice" value={choice} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {confirmed ? <input type="hidden" name="confirmed" value="1" /> : null}
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}

/** "Sofia", "Sofia and Omar", "Sofia, Omar and Lee". */
export function joinNames(matches: EventMatch[]): string {
  const names = matches.map((m) => m.firstName);
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Asked once per new match for an event: keep matching, or leave its pool. */
export function KeepMatchingPrompt({
  eventId,
  eventName,
  returnTo,
}: {
  eventId: string;
  eventName: string;
  returnTo: string;
}) {
  return (
    <div
      role="group"
      aria-label={`Keep matching for ${eventName}?`}
      className="flex flex-col gap-3 rounded-lg border border-green-600 bg-green-50 p-4 dark:bg-green-950"
    >
      <p className="font-medium">Keep matching for {eventName}?</p>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        If your team is set, leave this event&apos;s pool and nobody there will see you. You can
        come back any time.
      </p>
      <div className="flex flex-wrap gap-2">
        <Choice
          eventId={eventId}
          choice="keep-looking"
          returnTo={returnTo}
          className={secondaryButton}
        >
          Keep looking
        </Choice>
        <Choice eventId={eventId} choice="have-team" returnTo={returnTo} className={primaryButton}>
          I have my team
        </Choice>
      </div>
    </div>
  );
}

/** A member's place in an event's pool, on the event page. */
export function EventPoolPanel({
  eventId,
  eventName,
  slug,
  pool,
  confirmNotGoing,
}: {
  eventId: string;
  eventName: string;
  slug: string;
  pool: EventPool;
  /** "I'm no longer going" was pressed while they have matches: ask first. */
  confirmNotGoing: boolean;
}) {
  const here = `/e/${slug}`;
  if (!pool.going) {
    return (
      <Choice
        eventId={eventId}
        choice="going"
        returnTo={here}
        className={`self-start ${primaryButton}`}
      >
        I&apos;m interested in this event
      </Choice>
    );
  }
  const matched = pool.matches.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {pool.leftPool ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-medium">
            You&apos;re going and have your team. You&apos;re hidden from this event&apos;s list.
          </p>
          <Choice
            eventId={eventId}
            choice="looking-again"
            returnTo={here}
            className={secondaryButton}
          >
            I&apos;m looking again
          </Choice>
        </div>
      ) : (
        <p className="font-medium">You&apos;re in for this event.</p>
      )}

      {matched ? (
        <p>
          You&apos;ve matched with{" "}
          {pool.matches.length === 1 ? "1 person" : `${pool.matches.length} people`} for this event:{" "}
          {pool.matches.map((match, index) => (
            <span key={match.matchId}>
              {index > 0 ? ", " : null}
              <Link href={`/matches/${match.matchId}`} className="underline">
                {match.firstName}
              </Link>
            </span>
          ))}
          .
        </p>
      ) : null}

      {pool.askToKeepMatching && !(confirmNotGoing && matched) ? (
        <KeepMatchingPrompt eventId={eventId} eventName={eventName} returnTo={here} />
      ) : null}

      {confirmNotGoing && matched ? (
        <div
          role="group"
          aria-label="Not going?"
          className="flex flex-col gap-3 rounded-lg border border-amber-500 bg-amber-50 p-4 dark:bg-amber-950"
        >
          <p className="font-medium">
            You&apos;ve matched with {joinNames(pool.matches)} for this event. Let them know
            you&apos;re not going.
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Your matches and contact details stay. You&apos;ll no longer count as going.
          </p>
          <div className="flex flex-wrap gap-2">
            <Choice
              eventId={eventId}
              choice="not-going"
              returnTo={here}
              confirmed
              className={primaryButton}
            >
              Yes, I&apos;m not going
            </Choice>
            <Link href={here} className={secondaryButton}>
              Cancel
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {matched && !pool.leftPool && !pool.askToKeepMatching ? (
            <Choice eventId={eventId} choice="have-team" returnTo={here} className="underline">
              I have my team
            </Choice>
          ) : null}
          {matched ? (
            <Link href={`${here}?confirm=not-going`} className="underline">
              I&apos;m no longer going
            </Link>
          ) : (
            <Choice eventId={eventId} choice="not-going" returnTo={here} className="underline">
              I&apos;m not going after all
            </Choice>
          )}
        </div>
      )}
    </div>
  );
}

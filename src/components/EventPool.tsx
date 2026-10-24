import { Check } from "lucide-react";
import Link from "next/link";
import { eventPoolAction } from "@/app/actions/event-pool";
import { buttonClass } from "@/components/ui/Button";
import { joinNames } from "@/lib/my-events";
import type { EventPool } from "@/server/events";

/** One button that posts a pool choice for an event. */
export function Choice({
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
      className="flex flex-col gap-3 rounded-2xl bg-accent-soft p-4"
    >
      <p className="font-semibold text-accent-soft-ink">Keep matching for {eventName}?</p>
      <div className="flex flex-wrap gap-2">
        <Choice
          eventId={eventId}
          choice="keep-looking"
          returnTo={returnTo}
          className={buttonClass("outline", "sm")}
        >
          Keep looking
        </Choice>
        <Choice
          eventId={eventId}
          choice="have-team"
          returnTo={returnTo}
          className={buttonClass("primary", "sm")}
        >
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
        className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-bg text-[17px] font-bold text-success-ink ring-2 ring-green-600 transition ring-inset hover:bg-success-soft"
      >
        I&apos;m going!
      </Choice>
    );
  }
  const matched = pool.matches.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="status"
        className="flex items-center gap-3 rounded-2xl bg-success-soft px-4 py-3.5"
      >
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"
        >
          <Check className="size-5" strokeWidth={3} />
        </span>
        <span className="flex flex-1 flex-col">
          <span className="font-bold text-success-ink">You&apos;re going!</span>
          <span className="text-[13px] text-success-ink">
            {pool.leftPool
              ? "You have your team for this hackathon."
              : "You're in the pool for this hackathon."}
          </span>
        </span>
        {confirmNotGoing && matched ? null : matched ? (
          <Link
            href={`${here}?confirm=not-going`}
            className="text-sm font-semibold text-success-ink underline"
          >
            Not going?
          </Link>
        ) : (
          <Choice
            eventId={eventId}
            choice="not-going"
            returnTo={here}
            className="text-sm font-semibold text-success-ink underline"
          >
            Not going?
          </Choice>
        )}
      </div>

      {pool.leftPool ? (
        <Choice
          eventId={eventId}
          choice="looking-again"
          returnTo={here}
          className={buttonClass("ghost", "sm", "self-start")}
        >
          I&apos;m looking again
        </Choice>
      ) : null}

      {matched ? (
        <p className="text-sm">
          <span className="text-muted">Matched: </span>
          {pool.matches.map((match, index) => (
            <span key={match.matchId}>
              {index > 0 ? ", " : null}
              <Link href={`/matches/${match.matchId}`} className="font-medium underline">
                {match.firstName}
              </Link>
            </span>
          ))}
        </p>
      ) : null}

      {pool.askToKeepMatching && !(confirmNotGoing && matched) ? (
        <KeepMatchingPrompt eventId={eventId} eventName={eventName} returnTo={here} />
      ) : null}

      {confirmNotGoing && matched ? (
        <div
          role="group"
          aria-label="Not going?"
          className="flex flex-col gap-3 rounded-2xl bg-danger-soft p-4"
        >
          <p className="font-semibold text-danger-ink">
            Tell {joinNames(pool.matches.map((m) => m.firstName))} you&apos;re not going?
          </p>
          <div className="flex flex-wrap gap-2">
            <Choice
              eventId={eventId}
              choice="not-going"
              returnTo={here}
              confirmed
              className={buttonClass("primary", "sm")}
            >
              Yes, I&apos;m not going
            </Choice>
            <Link href={here} className={buttonClass("outline", "sm")}>
              Cancel
            </Link>
          </div>
        </div>
      ) : matched && !pool.leftPool && !pool.askToKeepMatching ? (
        <Choice
          eventId={eventId}
          choice="have-team"
          returnTo={here}
          className="self-start text-sm text-muted underline"
        >
          I have my team
        </Choice>
      ) : null}
    </div>
  );
}

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { STATUS_LABELS, teamSummary } from "@/lib/my-events";
import { formatDateRange } from "@/lib/time";
import type { MyEvent, MyHackathons as Data, TeamMate } from "@/server/events";
import { Choice, KeepMatchingPrompt } from "./EventPool";

const RETURN_TO = "/matches";
const smallButton = buttonClass("outline", "sm");

/** Team members as names, each linking to your pair page with them when there is one. */
function Members({ members }: { members: TeamMate[] }) {
  return (
    <>
      {members.map((member, index) => (
        <span key={member.id}>
          {index === 0 ? null : index === members.length - 1 ? " and " : ", "}
          {member.matchId ? (
            <Link href={`/matches/${member.matchId}`} className="underline">
              {member.firstName}
            </Link>
          ) : (
            member.firstName
          )}
        </span>
      ))}
    </>
  );
}

function EventLine({ event }: { event: MyEvent }) {
  return (
    <details
      open={event.askToKeepMatching}
      aria-label={event.name}
      className="group rounded-2xl bg-surface"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        {/* Spaces between the parts so the line reads as one sentence to screen readers. */}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">
            {event.name}{" "}
            <span className="font-normal text-muted">
              {formatDateRange(event.startDate, event.endDate)}
            </span>
          </span>{" "}
          <span className="truncate text-sm text-muted">
            {teamSummary(event)} · {STATUS_LABELS[event.status]}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted transition group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-col gap-3 border-t border-line px-4 py-3 text-sm">
        {event.teams.map((team) => (
          <p key={team.id}>
            <span className="font-medium">Your team:</span>{" "}
            {team.members.length ? <Members members={team.members} /> : "just you so far"}
          </p>
        ))}
        {event.matchedNoTeam.length ? (
          <p>
            <span className="font-medium">
              {event.teams.length ? "Also matched for this event:" : "Matched for this event:"}
            </span>{" "}
            {event.matchedNoTeam.map((match, index) => (
              <span key={match.matchId}>
                {index > 0 ? ", " : null}
                <Link href={`/matches/${match.matchId}`} className="underline">
                  {match.firstName}
                </Link>
              </span>
            ))}
            {event.teams.length ? null : (
              <span className="text-muted">. Pick a team on their page.</span>
            )}
          </p>
        ) : null}
        {!event.teams.length && !event.matchedNoTeam.length ? (
          <p className="text-muted">
            No matches for this event yet.{" "}
            <Link href={`/e/${event.slug}`} className="underline">
              See who&apos;s going →
            </Link>
          </p>
        ) : null}

        {event.askToKeepMatching ? (
          <KeepMatchingPrompt eventId={event.id} eventName={event.name} returnTo={RETURN_TO} />
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {event.status === "not-going" ? (
            <Choice eventId={event.id} choice="going" returnTo={RETURN_TO} className={smallButton}>
              I&apos;m going
            </Choice>
          ) : event.status === "have-team" ? (
            <Choice
              eventId={event.id}
              choice="looking-again"
              returnTo={RETURN_TO}
              className={smallButton}
            >
              I&apos;m looking again
            </Choice>
          ) : !event.askToKeepMatching && (event.teams.length || event.matchedNoTeam.length) ? (
            <Choice
              eventId={event.id}
              choice="have-team"
              returnTo={RETURN_TO}
              className={smallButton}
            >
              I have my team
            </Choice>
          ) : null}
          <Link href={`/e/${event.slug}`} className="underline">
            Event page
          </Link>
        </div>
      </div>
    </details>
  );
}

/** "Your hackathons" at the top of /matches: one expandable line per event. */
export function MyHackathons({ data }: { data: Data }) {
  return (
    <section aria-labelledby="section-hackathons" className="flex flex-col gap-3">
      <h2 id="section-hackathons" className="text-lg font-semibold">
        Your hackathons
      </h2>
      {data.events.length ? (
        <ul className="flex flex-col gap-2">
          {data.events.map((event) => (
            <li key={event.id}>
              <EventLine event={event} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          You&apos;re not going to any hackathons yet.{" "}
          <Link href="/events" className="underline">
            Browse upcoming hackathons →
          </Link>
        </p>
      )}
      {data.sideProjects.length ? (
        <div className="flex flex-col gap-1 rounded-xl bg-surface px-4 py-3 text-sm">
          <p className="font-semibold">Side projects</p>
          {data.sideProjects.map((team) => (
            <p key={team.id}>
              Team with{" "}
              {team.members.length ? <Members members={team.members} /> : "just you so far"}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

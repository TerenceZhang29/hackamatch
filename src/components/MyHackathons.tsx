import Link from "next/link";
import { STATUS_LABELS, teamSummary } from "@/lib/my-events";
import { formatDateRange } from "@/lib/time";
import type { MyEvent, MyHackathons as Data, TeamMate } from "@/server/events";
import { Choice, KeepMatchingPrompt } from "./EventPool";

const RETURN_TO = "/matches";
const smallButton =
  "rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700";

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
      className="group rounded-xl border border-neutral-200 dark:border-neutral-800"
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-sm">
        {/* Spaces between the parts so the line reads as one sentence to screen readers. */}
        <span className="font-semibold">{event.name}</span>{" "}
        <span className="text-neutral-500">{formatDateRange(event.startDate, event.endDate)}</span>{" "}
        <span>· {teamSummary(event)}</span>{" "}
        <span className="text-neutral-500">· {STATUS_LABELS[event.status]}</span>
        <span aria-hidden="true" className="ml-auto text-neutral-400 group-open:rotate-90">
          ▸
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
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
              <span className="text-neutral-500">. Pick a team on their page.</span>
            )}
          </p>
        ) : null}
        {!event.teams.length && !event.matchedNoTeam.length ? (
          <p className="text-neutral-500">
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
        <p className="text-sm text-neutral-500">
          You&apos;re not going to any hackathons yet.{" "}
          <Link href="/events" className="underline">
            Browse upcoming hackathons →
          </Link>
        </p>
      )}
      {data.sideProjects.length ? (
        <div className="flex flex-col gap-1 rounded-xl border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
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

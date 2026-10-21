import { CalendarDays, Code, Lightbulb } from "lucide-react";
import Link from "next/link";
import { Chip, TagList } from "@/components/ui/Chip";
import {
  lookingFor,
  ROLE_TAG_LABELS,
  roleTags,
  shortDate,
  topSkills,
  type Intent,
  type PoolEvent,
  type Role,
} from "@/lib/person-card";
import { tagLabel } from "@/lib/taxonomy/labels";

/** Hackathons as whole chips that wrap onto new lines ("Name · Nov 9"). */
export function HackathonChips({ events, label }: { events: readonly PoolEvent[]; label: string }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {events.map((event) => (
        <li key={event.id} className="whitespace-nowrap">
          <Chip tone="accent">
            <CalendarDays aria-hidden="true" className="size-3" />
            {event.name} · {shortDate(event.startDate)}
          </Chip>
        </li>
      ))}
    </ul>
  );
}

/** Builds / Ideas as two colored tags. */
export function RoleTags({ role }: { role: Role }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Role">
      {roleTags(role).map((tag) => (
        <li key={tag}>
          <Chip tone={tag}>
            {tag === "build" ? (
              <Code aria-hidden="true" className="size-3" />
            ) : (
              <Lightbulb aria-hidden="true" className="size-3" />
            )}
            {ROLE_TAG_LABELS[tag]}
          </Chip>
        </li>
      ))}
    </ul>
  );
}

function Line({
  label,
  clamp = false,
  children,
}: {
  label: string;
  /** At most two lines, with "…" (the full text is on the opened card). */
  clamp?: boolean;
  children: React.ReactNode;
}) {
  return (
    <p className={`text-sm ${clamp ? "line-clamp-2" : ""}`}>
      <span className="font-semibold">{label}:</span> {children}
    </p>
  );
}

/**
 * The body of a person card: role tags, Looking for (the nearest 3
 * hackathons they still want teammates for), Builds (top 3 skills), Ideas (how
 * many; the pitches live on idea cards, P1-23), You both (shared hackathons,
 * then areas) and Area.
 */
export function PersonLines({
  person,
  ideaCount = 0,
  ideasHref,
  lookingEvents,
  youBoth,
}: {
  person: {
    role: Role;
    intents: readonly Intent[];
    stack: readonly string[];
    skills: readonly string[];
    domains: readonly string[];
  };
  /** How many open ideas they have; nothing shows for none. */
  ideaCount?: number;
  /** Where the count links: their profile, which lists the ideas. */
  ideasHref?: string;
  /**
   * Nearest hackathons they're going to and still looking at (nearestPoolEvents).
   * Members only; without them the line says what they want in general.
   */
  lookingEvents?: readonly PoolEvent[];
  /** Shared hackathon names, then shared areas; left out where the viewer isn't known. */
  youBoth?: string[];
}) {
  const builds = person.role !== "idea" ? topSkills(person) : [];
  return (
    <>
      <RoleTags role={person.role} />
      {lookingEvents?.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold">Looking for:</p>
          {/* Each hackathon stays whole; ones that don't fit move to the next line. */}
          <HackathonChips events={lookingEvents} label="Looking for teammates at" />
        </div>
      ) : (
        <Line label="Looking for">{lookingFor(person.role, person.intents)}</Line>
      )}
      {builds.length ? <Line label="Builds">{builds.map(tagLabel).join(", ")}</Line> : null}
      {ideaCount > 0 ? (
        <Line label="Ideas">
          {ideasHref ? (
            <Link href={ideasHref} className="underline">
              {ideaCount === 1 ? "1 idea" : `${ideaCount} ideas`}
            </Link>
          ) : ideaCount === 1 ? (
            "1 idea"
          ) : (
            `${ideaCount} ideas`
          )}
        </Line>
      ) : null}
      {youBoth?.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-success-ink">You both</p>
          <ul className="flex flex-wrap gap-1.5" aria-label="You both">
            {youBoth.map((item) => (
              <li key={item}>
                <Chip tone="success">{item}</Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {person.domains.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold">Area:</span>
          <TagList tags={person.domains} label="Area" />
        </div>
      ) : null}
    </>
  );
}

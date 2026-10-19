import { CalendarDays, Code, Lightbulb } from "lucide-react";
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
 * The body of a person card, in the owner's order (2026-10-19): role tags,
 * Looking for (the nearest 3 hackathons they still want teammates for),
 * Ideas (their first idea's pitch), Builds (top 3 skills), You both (shared
 * hackathons, then areas) and Area.
 */
export function PersonLines({
  person,
  ideaPitch,
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
  /** Their first open idea's public pitch, when they have one. */
  ideaPitch: string | null;
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
          <ul className="flex flex-wrap gap-1.5" aria-label="Looking for teammates at">
            {lookingEvents.map((event) => (
              <li key={event.id} className="whitespace-nowrap">
                <Chip tone="accent">
                  <CalendarDays aria-hidden="true" className="size-3" />
                  {event.name} · {shortDate(event.startDate)}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Line label="Looking for">{lookingFor(person.role, person.intents)}</Line>
      )}
      {person.role !== "builder" && ideaPitch ? (
        <Line label="Ideas" clamp>
          {ideaPitch}
        </Line>
      ) : null}
      {builds.length ? <Line label="Builds">{builds.map(tagLabel).join(", ")}</Line> : null}
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

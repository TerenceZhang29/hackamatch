import { Check } from "lucide-react";
import { dateTile, topSkills, type PoolEvent } from "@/lib/person-card";
import { displayLabel } from "@/lib/taxonomy/labels";

function Section({
  title,
  dense,
  children,
}: {
  title: string;
  dense: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`flex flex-col ${dense ? "gap-1.5 sm:gap-2" : "gap-2"}`}>
      <h3
        className={`font-semibold tracking-wide text-muted uppercase ${
          dense ? "text-[11px] sm:text-xs" : "text-xs"
        }`}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A small calendar tile: "NOV" over "11". */
export function DateTile({
  isoDate,
  shared = false,
  large = false,
  dense = false,
}: {
  isoDate: string;
  /** The viewer is going too: green. */
  shared?: boolean;
  /** The event page's tile, on a white card. */
  large?: boolean;
  /** Smaller on phones (the deck card). */
  dense?: boolean;
}) {
  const { month, day } = dateTile(isoDate);
  const tone = large
    ? shared
      ? "bg-success-soft text-success-ink"
      : "bg-accent-soft text-ink"
    : shared
      ? "bg-bg text-success-ink"
      : "bg-bg text-ink";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 flex-col items-center justify-center gap-0.5 leading-none ${
        large
          ? "h-[62px] w-14 rounded-[14px]"
          : dense
            ? "h-10 w-[38px] rounded-lg sm:h-[46px] sm:w-11 sm:rounded-[10px]"
            : "h-[46px] w-11 rounded-[10px]"
      } ${tone}`}
    >
      <span
        className={`font-bold tracking-[0.06em] ${
          large ? "text-[11px]" : dense ? "text-[9px] sm:text-[10px]" : "text-[10px]"
        } ${shared ? "" : "text-accent"}`}
      >
        {month}
      </span>
      <span
        className={`font-extrabold ${large ? "text-2xl" : dense ? "text-base sm:text-lg" : "text-lg"}`}
      >
        {day}
      </span>
    </span>
  );
}

/**
 * The hackathons someone is going to, as date tiles. The ones the viewer is
 * going to as well come first, in green, with "You're going too" (P1-24).
 */
export function GoingTo({
  events,
  dense = false,
}: {
  events: readonly (PoolEvent & { shared?: boolean })[];
  /** Smaller on phones (the deck card). */
  dense?: boolean;
}) {
  const pad = dense
    ? (shared?: boolean) => (shared ? "px-1 py-[3px] sm:p-1.5" : "px-1.5 py-[5px] sm:p-2")
    : (shared?: boolean) => (shared ? "p-1.5" : "p-2");
  return (
    <ul className={`flex flex-col ${dense ? "gap-1.5 sm:gap-2" : "gap-2"}`} aria-label="Going to">
      {events.map((event) => (
        <li
          key={event.id}
          className={`flex items-center ${dense ? "gap-2.5 rounded-xl sm:gap-3 sm:rounded-[14px]" : "gap-3 rounded-[14px]"} ${
            event.shared ? "border-2 border-green-500 bg-success-soft" : "bg-surface"
          } ${pad(event.shared)}`}
        >
          <DateTile isoDate={event.startDate} shared={event.shared} dense={dense} />
          <span className="flex min-w-0 flex-col">
            <span className={`font-semibold ${dense ? "text-sm sm:text-[15px]" : "text-[15px]"}`}>
              {event.name}
            </span>
            {event.shared ? (
              <span
                className={`flex items-center gap-1 font-semibold text-success-ink ${
                  dense ? "text-xs sm:text-[13px]" : "text-[13px]"
                }`}
              >
                <Check aria-hidden="true" className="size-3" strokeWidth={3} />
                You&apos;re going too
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The body of a person card (P1-24): Going to (members only), Interest areas
 * and Top skills. No roles, goals or ideas.
 */
export function PersonLines({
  person,
  goingTo,
  dense = false,
}: {
  person: { stack: readonly string[]; skills: readonly string[]; domains: readonly string[] };
  /** Their upcoming hackathons, shared ones first; left out for visitors. */
  goingTo?: readonly (PoolEvent & { shared?: boolean })[];
  /** Smaller on phones (the deck card), so it fits above the buttons. */
  dense?: boolean;
}) {
  const skills = topSkills(person);
  const chip = dense
    ? "h-7 px-[11px] text-[13px] sm:h-[30px] sm:px-3 sm:text-sm"
    : "h-[30px] px-3 text-sm";
  return (
    <>
      {goingTo?.length ? (
        <Section title="Going to" dense={dense}>
          <GoingTo events={goingTo} dense={dense} />
        </Section>
      ) : null}
      {person.domains.length ? (
        <Section title="Interest areas" dense={dense}>
          <ul className="flex flex-wrap gap-1.5" aria-label="Interest areas">
            {person.domains.map((slug) => (
              <li key={slug}>
                <span
                  className={`inline-flex items-center rounded-full bg-surface font-medium ${chip}`}
                >
                  {displayLabel(slug)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {skills.length ? (
        <Section title="Top skills" dense={dense}>
          <ul className="flex flex-wrap gap-1.5" aria-label="Top skills">
            {skills.map((slug) => (
              <li key={slug}>
                <span
                  className={`inline-flex items-center rounded-full bg-accent-soft font-semibold text-accent-soft-ink ${chip}`}
                >
                  {displayLabel(slug)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

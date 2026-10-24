import { Check } from "lucide-react";
import { dateTile, topSkills, type PoolEvent } from "@/lib/person-card";
import { displayLabel } from "@/lib/taxonomy/labels";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** A small calendar tile: "NOV" over "11". */
export function DateTile({
  isoDate,
  shared = false,
  large = false,
}: {
  isoDate: string;
  /** The viewer is going too: green. */
  shared?: boolean;
  /** The event page's tile, on a white card. */
  large?: boolean;
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
        large ? "h-[62px] w-14 rounded-[14px]" : "h-[46px] w-11 rounded-[10px]"
      } ${tone}`}
    >
      <span
        className={`font-bold tracking-[0.06em] ${large ? "text-[11px]" : "text-[10px]"} ${
          shared ? "" : "text-accent"
        }`}
      >
        {month}
      </span>
      <span className={`font-extrabold ${large ? "text-2xl" : "text-lg"}`}>{day}</span>
    </span>
  );
}

/**
 * The hackathons someone is going to, as date tiles. The ones the viewer is
 * going to as well come first, in green, with "You're going too" (P1-24).
 */
export function GoingTo({ events }: { events: readonly (PoolEvent & { shared?: boolean })[] }) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Going to">
      {events.map((event) => (
        <li
          key={event.id}
          className={`flex items-center gap-3 rounded-[14px] ${
            event.shared ? "border-2 border-green-500 bg-success-soft p-1.5" : "bg-surface p-2"
          }`}
        >
          <DateTile isoDate={event.startDate} shared={event.shared} />
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] font-semibold">{event.name}</span>
            {event.shared ? (
              <span className="flex items-center gap-1 text-[13px] font-semibold text-success-ink">
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
}: {
  person: { stack: readonly string[]; skills: readonly string[]; domains: readonly string[] };
  /** Their upcoming hackathons, shared ones first; left out for visitors. */
  goingTo?: readonly (PoolEvent & { shared?: boolean })[];
}) {
  const skills = topSkills(person);
  return (
    <>
      {goingTo?.length ? (
        <Section title="Going to">
          <GoingTo events={goingTo} />
        </Section>
      ) : null}
      {person.domains.length ? (
        <Section title="Interest areas">
          <ul className="flex flex-wrap gap-1.5" aria-label="Interest areas">
            {person.domains.map((slug) => (
              <li key={slug}>
                <span className="inline-flex h-[30px] items-center rounded-full bg-surface px-3 text-sm font-medium">
                  {displayLabel(slug)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {skills.length ? (
        <Section title="Top skills">
          <ul className="flex flex-wrap gap-1.5" aria-label="Top skills">
            {skills.map((slug) => (
              <li key={slug}>
                <span className="inline-flex h-[30px] items-center rounded-full bg-accent-soft px-3 text-sm font-semibold text-accent-soft-ink">
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

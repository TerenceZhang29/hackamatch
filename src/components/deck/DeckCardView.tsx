import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { PersonCard } from "@/components/PersonCard";
import { GoingTo } from "@/components/PersonLines";
import { Chip } from "@/components/ui/Chip";
import { sharedFirst } from "@/lib/deck";
import { nearestPoolEvents } from "@/lib/person-card";
import { displayLabel } from "@/lib/taxonomy/labels";
import type { DeckDetails } from "@/server/deck";
import type { BoardPerson } from "@/server/board";

function Extra({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The card on top of the deck (P1-24), and when `expanded` its full profile
 * in place: every hackathon and every skill. Only fields members can already
 * see on person pages; contact details stay on the pair page.
 */
export function DeckCardView({
  person,
  details,
  expanded,
  moreHref,
  lessHref,
}: {
  person: BoardPerson;
  details: DeckDetails;
  expanded: boolean;
  moreHref: string;
  lessHref: string;
}) {
  const allEvents = sharedFirst(details.personEvents, details.viewerEventIds);
  // The nearest three, with shared ones first.
  const nearest = new Set(nearestPoolEvents(details.personEvents).map((e) => e.id));
  const goingTo = allEvents.filter((e) => e.shared || nearest.has(e.id)).slice(0, 3);
  const skills = [...new Set([...person.stack, ...person.skills])];
  const more = allEvents.length > goingTo.length || skills.length > 3;
  return (
    <PersonCard
      person={person}
      goingTo={goingTo}
      isDemo={details.isDemo}
      headingLevel={2}
      size="deck"
      // A tap on the deck card opens its full profile (Swipe), so the name isn't a link.
      linkName={false}
    >
      {expanded ? (
        <>
          {allEvents.length > goingTo.length ? (
            <Extra title="All hackathons">
              <GoingTo events={allEvents} />
            </Extra>
          ) : null}
          {skills.length > 3 ? (
            <Extra title="All skills">
              <ul className="flex flex-wrap gap-1.5" aria-label="All skills">
                {skills.map((slug) => (
                  <li key={slug}>
                    <Chip tone="accent">{displayLabel(slug)}</Chip>
                  </li>
                ))}
              </ul>
            </Extra>
          ) : null}
          <Link
            href={lessHref}
            scroll={false}
            className="flex items-center gap-1 self-center text-sm text-muted"
          >
            <ChevronUp aria-hidden="true" className="size-4" /> Show less
          </Link>
        </>
      ) : more ? (
        <Link
          href={moreHref}
          scroll={false}
          className="flex items-center gap-1 self-center text-sm text-muted"
        >
          <ChevronDown aria-hidden="true" className="size-4" /> See full profile
        </Link>
      ) : null}
    </PersonCard>
  );
}

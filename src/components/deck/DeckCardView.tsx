import { CalendarDays, ChevronDown, ChevronUp, Star } from "lucide-react";
import Link from "next/link";
import { scopeLabel } from "@/components/IdeaTags";
import { DemoChip } from "@/components/DemoChip";
import { HackathonChips, PersonLines, RoleTags } from "@/components/PersonLines";
import { Avatar } from "@/components/ui/Avatar";
import { Chip, TagList } from "@/components/ui/Chip";
import { inCommon, markNeeds } from "@/lib/deck";
import { ideaHackathons, nearestPoolEvents, topSkills } from "@/lib/person-card";
import { tagLabel } from "@/lib/taxonomy/labels";
import type { DeckCard, DeckDetails } from "@/server/deck";

/**"You both": shared tags and events, as green chips. Nothing when nothing is shared. */
function YouBoth({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-success-ink">You both</p>
      <ul className="flex flex-wrap gap-1.5" aria-label="You both">
        {items.map((item) => (
          <li key={item}>
            <Chip tone="success">{item}</Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Extra({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-4">
      <p className="text-xs font-semibold text-muted">{title}</p>
      {children}
    </div>
  );
}

const cardClass = "flex flex-col gap-4 rounded-3xl bg-surface p-6";

/**
 * The card on top of the deck, and when `expanded` its full profile in place.
 * Only fields members can already see on the board, event pages and person
 * pages; contact details stay on the pair page.
 */
export function DeckCardView({
  card,
  details,
  eventNames,
  expanded,
  moreHref,
  lessHref,
}: {
  card: DeckCard;
  details: DeckDetails;
  eventNames: Map<string, string>;
  expanded: boolean;
  moreHref: string;
  lessHref: string;
}) {
  const toggle = expanded ? (
    <Link
      href={lessHref}
      scroll={false}
      className="flex items-center gap-1 self-center text-sm text-muted"
    >
      <ChevronUp aria-hidden="true" className="size-4" /> Show less
    </Link>
  ) : (
    <Link
      href={moreHref}
      scroll={false}
      className="flex items-center gap-1 self-center text-sm text-muted"
    >
      <ChevronDown aria-hidden="true" className="size-4" /> See full profile
    </Link>
  );

  if (card.kind === "person") {
    const person = card.person;
    const skills = [...new Set([...person.stack, ...person.skills])];
    // You both: shared hackathons first, then shared areas.
    const shared = inCommon(details.viewer, {
      tags: person.domains,
      eventIds: details.personEvents.map((e) => e.id),
    });
    const sharedEvents = new Set(shared.eventIds);
    return (
      <article aria-label={person.display_name} className={cardClass}>
        <div className="flex items-center gap-3">
          <Avatar name={person.display_name} size={56} />
          <h2 className="text-2xl font-bold">{person.display_name}</h2>
          {details.isDemo ? (
            <span className="ml-auto">
              <DemoChip />
            </span>
          ) : null}
        </div>
        <PersonLines
          person={person}
          ideaCount={details.personIdeas.length}
          lookingEvents={nearestPoolEvents(details.personEvents)}
          youBoth={[
            ...details.personEvents.filter((e) => sharedEvents.has(e.id)).map((e) => e.name),
            ...shared.tags.map(tagLabel),
          ]}
        />
        {expanded ? (
          <>
            {details.personEvents.length ? (
              <Extra title="Hackathons">
                <ul className="flex flex-col gap-1 text-sm">
                  {details.personEvents.map((event) => (
                    <li key={event.id} className="flex items-center gap-1.5">
                      <CalendarDays aria-hidden="true" className="size-4 text-muted" />
                      {event.name}
                      {sharedEvents.has(event.id) ? (
                        <Star
                          aria-label="you're going too"
                          className="size-3.5 fill-current text-success-ink"
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Extra>
            ) : null}
            {details.personIdeas.length ? (
              <Extra title="All ideas">
                <ul className="flex flex-col gap-2 text-sm">
                  {details.personIdeas.map((pitch) => (
                    <li key={pitch} className="rounded-xl bg-bg px-3 py-2">
                      {pitch}
                    </li>
                  ))}
                </ul>
              </Extra>
            ) : null}
            {skills.length ? (
              <Extra title="All skills">
                <TagList tags={skills} label="All skills" />
              </Extra>
            ) : null}
          </>
        ) : null}
        {toggle}
      </article>
    );
  }

  const idea = card.idea;
  const owner = details.owner;
  const eventName =
    details.ideaEvent?.name ?? (idea.event_id ? eventNames.get(idea.event_id) : null);
  const needs = markNeeds(idea.skills_needed, details.viewer.tags);
  const hackathons = ideaHackathons(details.ideaEvent, details.personEvents);
  const allHackathons = ideaHackathons(details.ideaEvent, details.personEvents, Infinity);
  const shared = inCommon(details.viewer, {
    tags: [...(idea.domain ? [idea.domain] : []), ...(owner ? owner.domains : [])],
    eventIds: allHackathons.map((e) => e.id),
  });
  const sharedEvents = new Set(shared.eventIds);
  const meta = [idea.domain ? tagLabel(idea.domain) : null, scopeLabel(idea.scope)]
    .filter(Boolean)
    .join(" · ");
  return (
    <article aria-label={idea.pitch ?? "Idea"} className={cardClass}>
      <div className="flex items-start gap-3">
        <h2 className="text-2xl leading-snug font-bold">{idea.pitch ?? "New idea"}</h2>
        <span className="ml-auto flex shrink-0 gap-1.5">
          {details.isDemo ? <DemoChip /> : null}
          {idea.featured ? <Chip tone="accent">Featured</Chip> : null}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Avatar name={idea.owner_display} size={32} />
        <p className="text-sm font-medium">{idea.owner_display}</p>
        {owner ? <RoleTags role={owner.role} /> : null}
      </div>
      {meta ? <p className="text-sm text-muted">{meta}</p> : null}
      {hackathons.length ? (
        <HackathonChips events={hackathons} label="Hackathons" />
      ) : eventName ? (
        <p className="text-sm text-muted">{eventName}</p>
      ) : null}
      {needs.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-muted">Needs</p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Needs">
            {needs.map(({ tag, have }) => (
              <li key={tag}>
                <Chip tone={have ? "success" : "neutral"} checked={have}>
                  {tagLabel(tag)}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <YouBoth
        items={[
          ...allHackathons.filter((e) => sharedEvents.has(e.id)).map((e) => e.name),
          ...shared.tags.map(tagLabel),
        ]}
      />
      {expanded ? (
        <>
          {allHackathons.length > hackathons.length ? (
            <Extra title="All hackathons">
              <HackathonChips events={allHackathons} label="All hackathons" />
            </Extra>
          ) : null}
          {owner ? (
            <Extra title={`About ${owner.display_name}`}>
              {topSkills(owner).length ? (
                <p className="text-sm">
                  <span className="font-semibold">Builds:</span>{" "}
                  {topSkills(owner).map(tagLabel).join(", ")}
                </p>
              ) : null}
              <TagList tags={owner.domains} label="Their areas" />
              <Link href={`/people/${owner.user_id}`} className="text-sm underline">
                See {owner.display_name}&apos;s profile
              </Link>
            </Extra>
          ) : null}
        </>
      ) : null}
      {toggle}
    </article>
  );
}

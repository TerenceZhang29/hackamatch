import Link from "next/link";
import { Chips } from "@/components/Card";
import { scopeLabel } from "@/components/IdeaTags";
import { EXPERIENCE_LABELS, INTENT_LABELS, inCommon, markNeeds } from "@/lib/deck";
import { tagLabel } from "@/lib/taxonomy/labels";
import type { DeckCard, DeckDetails } from "@/server/deck";

const ROLE_LABELS = {
  idea: "Has an idea",
  builder: "Builder",
  both: "Builds and has ideas",
} as const;

const chip = "rounded-full px-2.5 py-0.5 text-xs";

/** "You both: react · health · Fall Hack", highlighted. Nothing when there's nothing shared. */
function YouBoth({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-green-800 dark:text-green-300">You both</p>
      <ul className="flex flex-wrap gap-1.5" aria-label="You both">
        {items.map((item) => (
          <li
            key={item}
            className={`${chip} bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100`}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-neutral-200 pt-3 dark:border-neutral-800">
      <p className="text-xs font-medium text-neutral-500">{title}</p>
      {children}
    </div>
  );
}

/**
 * The card on top of the deck: the fuller card, and when `expanded` the full
 * profile in place (decision 5). Members-only fields that the board, event
 * pages and person pages already show; contact details stay on the pair page.
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
    <Link href={lessHref} scroll={false} className="self-start text-sm underline">
      Show less
    </Link>
  ) : (
    <Link href={moreHref} scroll={false} className="self-start text-sm underline">
      See full profile
    </Link>
  );

  if (card.kind === "person") {
    const person = card.person;
    const tags = [...person.stack, ...person.skills];
    const shared = inCommon(details.viewer, {
      tags: [...tags, ...person.domains],
      eventIds: details.personEvents.map((e) => e.id),
    });
    const sharedEvents = new Set(shared.eventIds);
    return (
      <article
        aria-label={person.display_name}
        className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-6 dark:border-neutral-800"
      >
        <p className="text-xs font-medium text-neutral-500">{ROLE_LABELS[person.role]}</p>
        <h2 className="text-2xl font-bold">{person.display_name}</h2>
        {person.summary ? <p>{person.summary}</p> : null}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {person.intents.length ? (
            <>
              <dt className="text-neutral-500">Looking for</dt>
              <dd>{person.intents.map((i) => INTENT_LABELS[i]).join(" · ")}</dd>
            </>
          ) : null}
          {person.experience_level ? (
            <>
              <dt className="text-neutral-500">Experience</dt>
              <dd>{EXPERIENCE_LABELS[person.experience_level]}</dd>
            </>
          ) : null}
          {details.personEvents.length ? (
            <>
              <dt className="text-neutral-500">Going to</dt>
              <dd>
                {details.personEvents.map((event, index) => (
                  <span key={event.id}>
                    {index > 0 ? ", " : null}
                    {event.name}
                    {sharedEvents.has(event.id) ? " ★" : null}
                  </span>
                ))}
              </dd>
            </>
          ) : null}
        </dl>
        <YouBoth
          items={[
            ...shared.tags.map(tagLabel),
            ...details.personEvents.filter((e) => sharedEvents.has(e.id)).map((e) => e.name),
          ]}
        />
        <Chips tags={expanded ? tags : tags.slice(0, 6)} label="Skills" />
        {expanded ? (
          <>
            {person.domains.length ? (
              <Section title="Areas">
                <Chips tags={person.domains} label="Areas" />
              </Section>
            ) : null}
            {details.personIdeas.length ? (
              <Section title="Their ideas">
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                  {details.personIdeas.map((pitch) => (
                    <li key={pitch}>{pitch}</li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </>
        ) : null}
        {toggle}
      </article>
    );
  }

  const idea = card.idea;
  const owner = details.owner;
  const eventName = idea.event_id ? eventNames.get(idea.event_id) : null;
  const needs = markNeeds(idea.skills_needed, details.viewer.tags);
  const shared = inCommon(details.viewer, {
    tags: [...(idea.domain ? [idea.domain] : []), ...(owner ? owner.domains : [])],
    eventIds: idea.event_id ? [idea.event_id] : [],
  });
  const meta = [idea.domain ? tagLabel(idea.domain) : null, scopeLabel(idea.scope), eventName]
    .filter(Boolean)
    .join(" · ");
  return (
    <article
      aria-label={idea.pitch ?? "Idea"}
      className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-6 dark:border-neutral-800"
    >
      <p className="text-xs font-medium text-neutral-500">
        {idea.featured ? "Featured · " : ""}
        {idea.owner_display}
        {owner ? ` · ${ROLE_LABELS[owner.role]}` : ""}
      </p>
      <h2 className="text-xl font-bold">{idea.pitch ?? "New idea"}</h2>
      {meta ? <p className="text-sm text-neutral-500">{meta}</p> : null}
      {needs.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-neutral-500">Needs</p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Needs">
            {needs.map(({ tag, have }) => (
              <li
                key={tag}
                className={`${chip} ${
                  have
                    ? "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100"
                    : "bg-neutral-100 dark:bg-neutral-800"
                }`}
              >
                {tagLabel(tag)}
                {have ? <span aria-label=", you have this"> ✓</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <YouBoth
        items={[
          ...shared.tags.map(tagLabel),
          ...(shared.eventIds.length && eventName ? [eventName] : []),
        ]}
      />
      {expanded && owner ? (
        <Section title={`About ${owner.display_name}`}>
          {owner.summary ? <p className="text-sm">{owner.summary}</p> : null}
          <Chips tags={[...owner.stack, ...owner.skills]} label="Their skills" />
          <Chips tags={owner.domains} label="Their areas" />
        </Section>
      ) : null}
      {toggle}
    </article>
  );
}

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import type { PoolEvent } from "@/lib/person-card";
import { DemoChip } from "./DemoChip";
import { PersonLines } from "./PersonLines";

export interface PersonCardData {
  user_id: string;
  display_name: string;
  skills: string[];
  stack: string[];
  domains: string[];
}

/**
 * The person card (P1-24): an accent band with the avatar over it, the name,
 * then Going to, Interest areas and Top skills. Used in the deck, on the
 * board and on `/people/<id>`.
 */
export function PersonCard({
  person,
  goingTo,
  isDemo = false,
  actions,
  headingLevel = 3,
  size = "list",
  linkName = true,
  children,
}: {
  person: PersonCardData;
  /** Their upcoming hackathons, shared ones first. Members only. */
  goingTo?: readonly (PoolEvent & { shared?: boolean })[];
  /** A demo profile (docs/plans/demo-profiles.md). */
  isDemo?: boolean;
  actions?: React.ReactNode;
  /** The name's heading level, so it fits the page's outline. */
  headingLevel?: 1 | 2 | 3;
  /** "deck": the big card on Discover; "list": a card in a grid. */
  size?: "deck" | "list";
  /** Whether the name links to their page (not on their own page). */
  linkName?: boolean;
  /** Extra content at the bottom of the card, such as the deck's "See full profile". */
  children?: React.ReactNode;
}) {
  const Heading = `h${headingLevel}` as const;
  const deck = size === "deck";
  return (
    <article
      aria-label={person.display_name}
      className={`relative flex h-full flex-col overflow-hidden bg-bg ${
        deck
          ? "rounded-[28px] shadow-[0_10px_30px_rgba(22,22,26,0.08)]"
          : "rounded-2xl shadow-sm ring-1 ring-line"
      }`}
    >
      <div aria-hidden="true" className={`bg-accent-soft ${deck ? "h-16" : "h-12"}`} />
      {isDemo ? (
        <span className="absolute top-3 right-3">
          <DemoChip />
        </span>
      ) : null}
      <div className={`flex flex-col items-center gap-2.5 px-5 ${deck ? "-mt-10" : "-mt-8"}`}>
        <span className="rounded-full ring-4 ring-bg">
          <Avatar name={person.display_name} size={deck ? 80 : 64} />
        </span>
        <Heading
          className={`text-center leading-tight font-extrabold tracking-[-0.03em] ${
            deck ? "text-[30px]" : "text-xl"
          }`}
        >
          {linkName ? (
            <Link href={`/people/${person.user_id}`} className="hover:underline">
              {person.display_name}
            </Link>
          ) : (
            person.display_name
          )}
        </Heading>
      </div>
      <div
        className={`flex flex-1 flex-col ${deck ? "gap-[18px] px-5 pt-5 pb-6" : "gap-4 p-4 pt-3"}`}
      >
        <PersonLines person={person} goingTo={goingTo} />
        {actions ? <div className="mt-auto">{actions}</div> : null}
        {children}
      </div>
    </article>
  );
}

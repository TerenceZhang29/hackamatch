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
      {/* The deck card is smaller on phones, so it fits above the buttons (P1-24 fix). */}
      <div aria-hidden="true" className={`bg-accent-soft ${deck ? "h-10 sm:h-16" : "h-12"}`} />
      {isDemo ? (
        <span className="absolute top-3 right-3">
          <DemoChip />
        </span>
      ) : null}
      <div
        className={`flex flex-col items-center px-5 ${
          deck ? "-mt-[30px] gap-2 sm:-mt-10 sm:gap-2.5" : "-mt-8 gap-2.5"
        }`}
      >
        <span className={`rounded-full ring-bg ${deck ? "ring-[3px] sm:ring-4" : "ring-4"}`}>
          <Avatar
            name={person.display_name}
            size={deck ? 80 : 64}
            className={deck ? "max-sm:size-[60px] max-sm:text-xl" : ""}
          />
        </span>
        <Heading
          className={`text-center leading-tight font-extrabold tracking-[-0.03em] ${
            deck ? "text-[26px] sm:text-[30px]" : "text-xl"
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
        className={`flex flex-1 flex-col ${
          deck ? "gap-3.5 px-4 pt-3.5 pb-5 sm:gap-[18px] sm:px-5 sm:pt-5 sm:pb-6" : "gap-4 p-4 pt-3"
        }`}
      >
        <PersonLines person={person} goingTo={goingTo} dense={deck} />
        {actions ? <div className="mt-auto">{actions}</div> : null}
        {children}
      </div>
    </article>
  );
}

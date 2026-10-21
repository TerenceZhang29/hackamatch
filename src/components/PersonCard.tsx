import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import type { Intent, PoolEvent } from "@/lib/person-card";
import { CardFrame } from "./Card";
import { DemoChip } from "./DemoChip";
import { PersonLines } from "./PersonLines";

export interface PersonCardData {
  user_id: string;
  display_name: string;
  role: "idea" | "builder" | "both";
  intents: Intent[];
  skills: string[];
  stack: string[];
  domains: string[];
}

/** A person card (P1-23) in a list: board, event pages, /people. The same lines as on Discover. */
export function PersonCard({
  person,
  ideaCount = 0,
  lookingEvents,
  isDemo = false,
  actions,
  headingLevel = 3,
}: {
  person: PersonCardData;
  /** How many open ideas they have (see ideaCounts); the pitches are on idea cards. */
  ideaCount?: number;
  /** Members only (see poolEventsFor); visitors don't see who's going where. */
  lookingEvents?: readonly PoolEvent[];
  /** A demo profile (docs/plans/demo-profiles.md). */
  isDemo?: boolean;
  actions?: React.ReactNode;
  /** The card title's heading level, so it fits the page's outline. */
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <CardFrame label={person.display_name}>
      <div className="flex items-center gap-3">
        <Avatar name={person.display_name} />
        <Heading className="text-base font-semibold">
          <Link href={`/people/${person.user_id}`} className="hover:underline">
            {person.display_name}
          </Link>
        </Heading>
        {isDemo ? (
          <span className="ml-auto">
            <DemoChip />
          </span>
        ) : null}
      </div>
      <PersonLines
        person={person}
        ideaCount={ideaCount}
        ideasHref={`/people/${person.user_id}#ideas`}
        lookingEvents={lookingEvents}
      />
      <div className="mt-auto">{actions}</div>
    </CardFrame>
  );
}

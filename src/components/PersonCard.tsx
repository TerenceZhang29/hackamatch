import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import type { Intent, PoolEvent } from "@/lib/person-card";
import { CardFrame } from "./Card";
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

/** A person in a list (board, event pages, /people): the same lines as their Discover card. */
export function PersonCard({
  person,
  ideaPitch = null,
  lookingEvents,
  actions,
  headingLevel = 3,
}: {
  person: PersonCardData;
  /** Their first open idea's pitch (see firstIdeaPitches). */
  ideaPitch?: string | null;
  /** Members only (see poolEventsFor); visitors don't see who's going where. */
  lookingEvents?: readonly PoolEvent[];
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
      </div>
      <PersonLines person={person} ideaPitch={ideaPitch} lookingEvents={lookingEvents} />
      <div className="mt-auto">{actions}</div>
    </CardFrame>
  );
}

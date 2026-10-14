import Link from "next/link";
import { CardFrame, Chips } from "./Card";

export interface PersonCardData {
  user_id: string;
  display_name: string;
  role: "idea" | "builder" | "both";
  summary: string | null;
  skills: string[];
  stack: string[];
  domains: string[];
}

const ROLE_LABELS = {
  idea: "Has an idea",
  builder: "Builder",
  both: "Builds and has ideas",
} as const;

export function PersonCard({
  person,
  actions,
  headingLevel = 3,
}: {
  person: PersonCardData;
  actions?: React.ReactNode;
  /** The card title's heading level, so it fits the page's outline. */
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <CardFrame label={person.display_name}>
      <p className="text-xs font-medium text-neutral-500">{ROLE_LABELS[person.role]}</p>
      <Heading className="text-base font-semibold">
        <Link href={`/people/${person.user_id}`} className="hover:underline">
          {person.display_name}
        </Link>
      </Heading>
      {person.summary ? (
        <p className="text-sm text-neutral-700 dark:text-neutral-300">{person.summary}</p>
      ) : null}
      <Chips tags={[...person.stack, ...person.skills]} label="Skills" />
      <Chips tags={person.domains} label="Areas" />
      {actions}
    </CardFrame>
  );
}

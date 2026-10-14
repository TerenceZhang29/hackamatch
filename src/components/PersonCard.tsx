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
}: {
  person: PersonCardData;
  actions?: React.ReactNode;
}) {
  return (
    <CardFrame label={person.display_name}>
      <p className="text-xs font-medium text-neutral-500">{ROLE_LABELS[person.role]}</p>
      <h3 className="text-base font-semibold">
        <Link href={`/people/${person.user_id}`} className="hover:underline">
          {person.display_name}
        </Link>
      </h3>
      {person.summary ? (
        <p className="text-sm text-neutral-700 dark:text-neutral-300">{person.summary}</p>
      ) : null}
      <Chips tags={[...person.stack, ...person.skills]} label="Skills" />
      <Chips tags={person.domains} label="Areas" />
      {actions}
    </CardFrame>
  );
}

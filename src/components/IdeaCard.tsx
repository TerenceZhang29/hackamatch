import Link from "next/link";
import { scopeLabel } from "@/components/IdeaTags";
import { tagLabel } from "@/lib/taxonomy/labels";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Chip";
import { CardFrame, Chips } from "./Card";
import { DemoChip } from "./DemoChip";

export interface IdeaCardData {
  id: string;
  pitch: string | null;
  domain: string | null;
  skills_needed: string[];
  scope: "weekend" | "few_weeks" | "ongoing" | null;
  featured: boolean;
  owner_display: string;
}

export function IdeaCard({
  idea,
  eventName,
  isDemo = false,
  actions,
  headingLevel = 3,
}: {
  idea: IdeaCardData;
  eventName?: string | null;
  /** The owner is a demo profile (docs/plans/demo-profiles.md). */
  isDemo?: boolean;
  actions?: React.ReactNode;
  /** The card title's heading level, so it fits the page's outline. */
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  const meta = [
    idea.domain ? tagLabel(idea.domain) : null,
    scopeLabel(idea.scope),
    eventName ?? null,
  ].filter(Boolean);
  return (
    <CardFrame label={idea.pitch ?? "Idea"}>
      <div className="flex items-center gap-2">
        <Avatar name={idea.owner_display} size={32} />
        <p className="text-xs font-medium text-muted">{idea.owner_display}</p>
        <span className="ml-auto flex gap-1.5">
          {isDemo ? <DemoChip /> : null}
          {idea.featured ? <Chip tone="accent">Featured</Chip> : null}
        </span>
      </div>
      <Heading className="line-clamp-3 text-base font-semibold">
        <Link href={`/ideas/${idea.id}`} className="hover:underline">
          {idea.pitch ?? "New idea"}
        </Link>
      </Heading>
      {meta.length ? <p className="text-sm text-muted">{meta.join(" · ")}</p> : null}
      <Chips tags={idea.skills_needed} label="Skills needed" />
      <div className="mt-auto">{actions}</div>
    </CardFrame>
  );
}

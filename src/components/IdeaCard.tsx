import Link from "next/link";
import { scopeLabel } from "@/components/IdeaTags";
import type { PoolEvent } from "@/lib/person-card";
import { tagLabel } from "@/lib/taxonomy/labels";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Chip";
import { CardFrame, Chips } from "./Card";
import { DemoChip } from "./DemoChip";
import { HackathonChips } from "./PersonLines";

export interface IdeaCardData {
  id: string;
  owner_id?: string;
  pitch: string | null;
  domain: string | null;
  skills_needed: string[];
  scope: "weekend" | "few_weeks" | "ongoing" | null;
  featured: boolean;
  owner_display: string;
}

/**
 * An idea card (P1-23): the idea first, then who it's from, the hackathons
 * it's for and the skills it needs. Only the public pitch; the full text
 * stays private until a mutual match.
 */
export function IdeaCard({
  idea,
  eventName,
  hackathons,
  isDemo = false,
  actions,
  headingLevel = 3,
}: {
  idea: IdeaCardData;
  /** The event the idea is tagged with, if any. */
  eventName?: string | null;
  /**
   * Members only: the owner's nearest hackathons where they're still looking
   * (poolEventsFor). Visitors see the idea's own event, if any, as text.
   */
  hackathons?: readonly PoolEvent[];
  /** The owner is a demo profile (docs/plans/demo-profiles.md). */
  isDemo?: boolean;
  actions?: React.ReactNode;
  /** The card title's heading level, so it fits the page's outline. */
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  const meta = [idea.domain ? tagLabel(idea.domain) : null, scopeLabel(idea.scope)].filter(Boolean);
  const showEventText = eventName && !hackathons?.length;
  return (
    <CardFrame label={idea.pitch ?? "Idea"}>
      <div className="flex items-start gap-2">
        <Heading className="line-clamp-3 text-lg leading-snug font-semibold">
          <Link href={`/ideas/${idea.id}`} className="hover:underline">
            {idea.pitch ?? "New idea"}
          </Link>
        </Heading>
        <span className="ml-auto flex shrink-0 gap-1.5">
          {isDemo ? <DemoChip /> : null}
          {idea.featured ? <Chip tone="accent">Featured</Chip> : null}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Avatar name={idea.owner_display} size={32} />
        {idea.owner_id ? (
          <Link
            href={`/people/${idea.owner_id}`}
            className="text-sm font-medium text-muted hover:underline"
          >
            {idea.owner_display}
          </Link>
        ) : (
          <p className="text-sm font-medium text-muted">{idea.owner_display}</p>
        )}
      </div>
      {meta.length || showEventText ? (
        <p className="text-sm text-muted">
          {[...meta, ...(showEventText ? [eventName] : [])].join(" · ")}
        </p>
      ) : null}
      {hackathons?.length ? <HackathonChips events={hackathons} label="Hackathons" /> : null}
      <Chips tags={idea.skills_needed} label="Skills needed" />
      <div className="mt-auto">{actions}</div>
    </CardFrame>
  );
}

import Link from "next/link";
import { scopeLabel } from "@/components/IdeaTags";
import { tagLabel } from "@/lib/taxonomy/labels";
import { CardFrame, Chips } from "./Card";

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
  actions,
}: {
  idea: IdeaCardData;
  eventName?: string | null;
  actions?: React.ReactNode;
}) {
  const meta = [
    idea.domain ? tagLabel(idea.domain) : null,
    scopeLabel(idea.scope),
    eventName ?? null,
  ].filter(Boolean);
  return (
    <CardFrame label={idea.pitch ?? "Idea"}>
      <p className="text-xs font-medium text-neutral-500">
        {idea.featured ? "Featured · " : ""}
        {idea.owner_display}
      </p>
      <h3 className="text-base font-semibold">
        <Link href={`/ideas/${idea.id}`} className="hover:underline">
          {idea.pitch ?? "New idea"}
        </Link>
      </h3>
      {meta.length ? <p className="text-sm text-neutral-500">{meta.join(" · ")}</p> : null}
      <Chips tags={idea.skills_needed} label="Skills needed" />
      {actions}
    </CardFrame>
  );
}

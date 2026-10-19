import { SlidersHorizontal } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { BOARD_INTENTS, hasFilters, type BoardState } from "@/lib/board";
import { tagLabel } from "@/lib/taxonomy/labels";

const INTENT_LABELS = {
  hackathon: "Hackathon partner",
  side_project: "Side project",
  cofounder: "Co-founder",
} as const;

const selectClass = "h-9 min-w-0 rounded-lg border border-line bg-bg px-2 text-sm";

/**
 * Filters as a plain GET form, so they work without JavaScript and the
 * resulting URL can be shared.
 */
export function BoardFilters({
  state,
  events,
  domains,
  skills,
}: {
  state: BoardState;
  events: { slug: string; name: string }[];
  domains: string[];
  skills: string[];
}) {
  const { filters } = state;
  return (
    // Closed behind one "Filter" button unless a filter is on; <details> needs no JavaScript.
    <details open={hasFilters(filters)} className="group open:basis-full">
      <summary
        className={buttonClass(
          "secondary",
          "sm",
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
        )}
      >
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        Filter
      </summary>
      <form
        method="get"
        action="/"
        aria-label="Filters"
        className="mt-2 flex flex-wrap items-end gap-2 rounded-2xl bg-surface p-3"
      >
        {state.tab !== "ideas" ? <input type="hidden" name="tab" value={state.tab} /> : null}
        {state.view ? <input type="hidden" name="view" value={state.view} /> : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-event" className="text-xs text-muted">
            Hackathon
          </label>
          <select
            id="filter-event"
            name="event"
            defaultValue={filters.event ?? ""}
            className={selectClass}
          >
            <option value="">Any</option>
            {events.map((event) => (
              <option key={event.slug} value={event.slug}>
                {event.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-domain" className="text-xs text-muted">
            Area
          </label>
          <select
            id="filter-domain"
            name="domain"
            defaultValue={filters.domain ?? ""}
            className={selectClass}
          >
            <option value="">Any</option>
            {domains.map((slug) => (
              <option key={slug} value={slug}>
                {tagLabel(slug)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-skill" className="text-xs text-muted">
            Skill
          </label>
          <select
            id="filter-skill"
            name="skill"
            defaultValue={filters.skill ?? ""}
            className={selectClass}
          >
            <option value="">Any</option>
            {skills.map((slug) => (
              <option key={slug} value={slug}>
                {tagLabel(slug)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-intent" className="text-xs text-muted">
            Looking for
          </label>
          <select
            id="filter-intent"
            name="intent"
            defaultValue={filters.intent ?? ""}
            className={selectClass}
          >
            <option value="">Anything</option>
            {BOARD_INTENTS.map((intent) => (
              <option key={intent} value={intent}>
                {INTENT_LABELS[intent]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClass("primary", "sm")}>
          Apply
        </button>
      </form>
    </details>
  );
}

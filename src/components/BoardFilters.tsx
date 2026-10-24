import { Select } from "@/components/ui/Field";
import { SlidersHorizontal } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { hasFilters, type BoardState } from "@/lib/board";
import { displayLabel } from "@/lib/taxonomy/labels";

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
        {state.view ? <input type="hidden" name="view" value={state.view} /> : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-event" className="text-xs text-muted">
            Hackathon
          </label>
          <Select id="filter-event" name="event" defaultValue={filters.event ?? ""} size="sm">
            <option value="">Any</option>
            {events.map((event) => (
              <option key={event.slug} value={event.slug}>
                {event.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-domain" className="text-xs text-muted">
            Area
          </label>
          <Select id="filter-domain" name="domain" defaultValue={filters.domain ?? ""} size="sm">
            <option value="">Any</option>
            {domains.map((slug) => (
              <option key={slug} value={slug}>
                {displayLabel(slug)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-skill" className="text-xs text-muted">
            Skill
          </label>
          <Select id="filter-skill" name="skill" defaultValue={filters.skill ?? ""} size="sm">
            <option value="">Any</option>
            {skills.map((slug) => (
              <option key={slug} value={slug}>
                {displayLabel(slug)}
              </option>
            ))}
          </Select>
        </div>
        <button type="submit" className={buttonClass("primary", "sm")}>
          Apply
        </button>
      </form>
    </details>
  );
}

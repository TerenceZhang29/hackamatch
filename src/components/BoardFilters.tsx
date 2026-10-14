import { BOARD_INTENTS, type BoardState } from "@/lib/board";
import { tagLabel } from "@/lib/taxonomy/labels";

const INTENT_LABELS = {
  hackathon: "Hackathon partner",
  side_project: "Side project",
  cofounder: "Co-founder",
} as const;

const selectClass =
  "min-w-0 rounded-lg border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700";

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
    <form method="get" action="/" className="flex flex-wrap items-end gap-2" aria-label="Filters">
      {state.tab !== "ideas" ? <input type="hidden" name="tab" value={state.tab} /> : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-event" className="text-xs text-neutral-500">
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
        <label htmlFor="filter-domain" className="text-xs text-neutral-500">
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
        <label htmlFor="filter-skill" className="text-xs text-neutral-500">
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
        <label htmlFor="filter-intent" className="text-xs text-neutral-500">
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
      <button
        type="submit"
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
      >
        Apply
      </button>
    </form>
  );
}

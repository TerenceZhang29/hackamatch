"use client";

import { buttonClass } from "@/components/ui/Button";

import { useId, useState } from "react";
import { tagLabel } from "@/lib/taxonomy/labels";

export type TagGroup = "skills" | "stack" | "domains";
export type TagValues = Record<TagGroup, string[]>;

const GROUP_LABELS: Record<TagGroup, string> = {
  skills: "Skills",
  stack: "Tools and languages",
  domains: "Areas",
};

export { tagLabel };

/**
 * Chips for the three tag groups. Tap × to remove; type to add, with
 * suggestions from the taxonomy. The server normalizes whatever is submitted,
 * so free text that is not in the taxonomy is dropped there.
 */
export function TagEditor<G extends TagGroup = TagGroup>({
  value,
  onChange,
  suggestions,
  groups = Object.keys(GROUP_LABELS) as G[],
  labels = {},
}: {
  value: Record<G, string[]>;
  onChange: (value: Record<G, string[]>) => void;
  suggestions: Record<G, string[]>;
  /** Which groups to show; all three by default. */
  groups?: G[];
  /** Overrides for group labels, e.g. "Skills needed" on an idea. */
  labels?: Partial<Record<G, string>>;
}) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <TagGroupEditor
          key={group}
          label={labels[group] ?? GROUP_LABELS[group]}
          tags={value[group]}
          suggestions={suggestions[group]}
          onChange={(tags) => onChange({ ...value, [group]: tags })}
        />
      ))}
    </div>
  );
}

function TagGroupEditor({
  label,
  tags,
  suggestions,
  onChange,
}: {
  label: string;
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const listId = `${inputId}-list`;

  function add() {
    const slug = draft.trim().toLowerCase().replaceAll(/\s+/g, "-");
    if (slug && !tags.includes(slug)) onChange([...tags, slug]);
    setDraft("");
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <ul className="flex flex-wrap gap-2" aria-label={label}>
        {tags.map((tag) => (
          <li
            key={tag}
            className="flex items-center gap-1 rounded-full bg-accent-soft py-1 pr-1 pl-3 text-sm text-accent-soft-ink"
          >
            {tagLabel(tag)}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              aria-label={`Remove ${tagLabel(tag)}`}
              className="rounded-full px-2 hover:bg-bg"
            >
              ×
            </button>
          </li>
        ))}
        {tags.length === 0 ? <li className="text-sm text-muted">None yet</li> : null}
      </ul>
      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Add to {label.toLowerCase()}
        </label>
        <input
          id={inputId}
          list={listId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={`Add to ${label.toLowerCase()}`}
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
        />
        <datalist id={listId}>
          {suggestions
            .filter((slug) => !tags.includes(slug))
            .map((slug) => (
              <option key={slug} value={slug} />
            ))}
        </datalist>
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className={buttonClass("outline", "sm", "h-10")}
        >
          Add
        </button>
      </div>
    </fieldset>
  );
}

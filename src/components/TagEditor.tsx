"use client";

import { useId, useState } from "react";

export type TagGroup = "skills" | "stack" | "domains";
export type TagValues = Record<TagGroup, string[]>;

const GROUP_LABELS: Record<TagGroup, string> = {
  skills: "Skills",
  stack: "Tools and languages",
  domains: "Areas",
};

/** Shows a slug the way people write it: `ux-design` → `ux design`. */
export function tagLabel(slug: string): string {
  return slug.replaceAll("-", " ");
}

/**
 * Chips for the three tag groups. Tap × to remove; type to add, with
 * suggestions from the taxonomy. The server normalizes whatever is submitted,
 * so free text that is not in the taxonomy is dropped there.
 */
export function TagEditor({
  value,
  onChange,
  suggestions,
}: {
  value: TagValues;
  onChange: (value: TagValues) => void;
  suggestions: Record<TagGroup, string[]>;
}) {
  return (
    <div className="flex flex-col gap-4">
      {(Object.keys(GROUP_LABELS) as TagGroup[]).map((group) => (
        <TagGroupEditor
          key={group}
          group={group}
          tags={value[group]}
          suggestions={suggestions[group]}
          onChange={(tags) => onChange({ ...value, [group]: tags })}
        />
      ))}
    </div>
  );
}

function TagGroupEditor({
  group,
  tags,
  suggestions,
  onChange,
}: {
  group: TagGroup;
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const listId = `${inputId}-list`;
  const label = GROUP_LABELS[group];

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
            className="flex items-center gap-1 rounded-full bg-neutral-100 py-1 pr-1 pl-3 text-sm dark:bg-neutral-800"
          >
            {tagLabel(tag)}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              aria-label={`Remove ${tagLabel(tag)}`}
              className="rounded-full px-2 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
            >
              ×
            </button>
          </li>
        ))}
        {tags.length === 0 ? <li className="text-sm text-neutral-500">None yet</li> : null}
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
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100"
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
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
        >
          Add
        </button>
      </div>
    </fieldset>
  );
}

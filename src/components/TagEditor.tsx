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
  const [open, setOpen] = useState(false);
  /** The highlighted suggestion (arrow keys), or -1 for none: Enter then adds what was typed. */
  const [active, setActive] = useState(-1);
  const inputId = useId();
  const listId = `${inputId}-list`;

  // Every suggestion not picked yet, narrowed by what's typed: names starting
  // with it first, then containing it. The list scrolls.
  const query = draft.trim().toLowerCase().replaceAll(/\s+/g, "-");
  const matches = suggestions
    .filter((slug) => !tags.includes(slug) && slug.includes(query))
    .sort((a, b) => Number(!a.startsWith(query)) - Number(!b.startsWith(query)));
  const showList = open && matches.length > 0;

  function add(value = draft) {
    const slug = value.trim().toLowerCase().replaceAll(/\s+/g, "-");
    if (slug && !tags.includes(slug)) onChange([...tags, slug]);
    setDraft("");
    setActive(-1);
    // Closed until the next click, keystroke or arrow, so it doesn't cover what's below.
    setOpen(false);
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
        <div className="relative min-w-0 flex-1">
          <input
            id={inputId}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            autoComplete="off"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            // A click opens the list too, also after Esc closed it.
            onClick={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && matches.length) {
                event.preventDefault();
                setOpen(true);
                setActive((i) => (i + 1) % matches.length);
              } else if (event.key === "ArrowUp" && matches.length) {
                event.preventDefault();
                setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
              } else if (event.key === "Escape") {
                setOpen(false);
                setActive(-1);
              } else if (event.key === "Enter") {
                event.preventDefault();
                add(showList && active >= 0 ? matches[active] : draft);
              }
            }}
            placeholder={`Add to ${label.toLowerCase()}`}
            className="h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
          />
          {/* Always in the page, so aria-controls points at it; hidden when there's nothing to show. */}
          <ul
            id={listId}
            hidden={!showList}
            role="listbox"
            aria-label={`Suggestions for ${label.toLowerCase()}`}
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-line bg-bg p-1 shadow-lg"
          >
            {matches.map((slug, i) => (
              <li
                key={slug}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Before blur, so the click lands while the list is still open.
                onMouseDown={(event) => {
                  event.preventDefault();
                  add(slug);
                }}
                className={`cursor-pointer rounded-lg px-3 py-2 text-sm ${
                  i === active ? "bg-accent-soft text-accent-soft-ink" : "text-ink hover:bg-surface"
                }`}
              >
                {tagLabel(slug)}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={() => add()}
          disabled={!draft.trim()}
          className={buttonClass("outline", "sm", "h-10")}
        >
          Add
        </button>
      </div>
    </fieldset>
  );
}

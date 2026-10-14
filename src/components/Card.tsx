import { tagLabel } from "@/lib/taxonomy/labels";

/** Shared card frame and tag chips for board cards. */

export function CardFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <article
      aria-label={label}
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
    >
      {children}
    </article>
  );
}

export function Chips({ tags, label }: { tags: string[]; label: string }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {tags.map((tag) => (
        <li
          key={tag}
          className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs dark:bg-neutral-800"
        >
          {tagLabel(tag)}
        </li>
      ))}
    </ul>
  );
}

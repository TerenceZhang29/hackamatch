import { TagList } from "@/components/ui/Chip";

/** Shared card frame and tag chips for list cards (board, event pages). */

export function CardFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <article aria-label={label} className="flex h-full flex-col gap-3 rounded-2xl bg-surface p-4">
      {children}
    </article>
  );
}

export function Chips({ tags, label }: { tags: string[]; label: string }) {
  return <TagList tags={tags} label={label} />;
}

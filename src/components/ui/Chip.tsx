import { Check } from "lucide-react";
import { tagLabel } from "@/lib/taxonomy/labels";

export type ChipTone = "neutral" | "accent" | "success" | "build" | "idea";

const TONES: Record<ChipTone, string> = {
  neutral: "bg-surface-2 text-ink",
  accent: "bg-accent-soft text-accent-soft-ink",
  success: "bg-success-soft text-success-ink",
  /** Role tags: Builds (indigo) and Ideas (amber), so they read apart at a glance. */
  build: "bg-accent-soft text-accent-soft-ink",
  idea: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

export function chipClass(tone: ChipTone = "neutral") {
  return `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TONES[tone]}`;
}

/** One small label. `checked` adds a ✓ that screen readers hear as "you have this". */
export function Chip({
  children,
  tone = "neutral",
  checked = false,
}: {
  children: React.ReactNode;
  tone?: ChipTone;
  checked?: boolean;
}) {
  return (
    <span className={chipClass(tone)}>
      {children}
      {checked ? (
        <>
          <Check aria-hidden="true" className="size-3" strokeWidth={3} />
          <span className="sr-only">, you have this</span>
        </>
      ) : null}
    </span>
  );
}

/** A list of taxonomy tags as chips; nothing when empty. */
export function TagList({
  tags,
  label,
  tone = "neutral",
  checked,
}: {
  tags: readonly string[];
  label: string;
  tone?: ChipTone;
  /** Tags to mark with ✓ (and tone them success). */
  checked?: ReadonlySet<string>;
}) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {tags.map((tag) => {
        const has = checked?.has(tag) ?? false;
        return (
          <li key={tag}>
            <Chip tone={has ? "success" : tone} checked={has}>
              {tagLabel(tag)}
            </Chip>
          </li>
        );
      })}
    </ul>
  );
}

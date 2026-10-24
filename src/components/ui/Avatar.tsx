/** Initials from a display name: "Maya P." → "MP", "Cornell student" → "CS". */
export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    parts.length > 1 ? parts[0]![0]! + parts.at(-1)![0]! : (parts[0]?.slice(0, 2) ?? "?")
  ).toUpperCase();
}

// A stable soft color per name, from a small palette that reads in both themes.
const COLORS = [
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
];

function colorFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length]!;
}

/** An initials circle. Decorative: the name is always next to it. */
export function Avatar({ name, size = 40 }: { name: string; size?: 32 | 40 | 56 | 64 | 72 | 80 }) {
  const dims = {
    32: "size-8 text-xs",
    40: "size-10 text-sm",
    56: "size-14 text-lg",
    64: "size-16 text-xl",
    72: "size-18 text-xl",
    80: "size-20 text-2xl",
  }[size];
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${dims} ${colorFor(name)}`}
    >
      {initials(name)}
    </span>
  );
}

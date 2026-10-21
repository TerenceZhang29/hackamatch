import { ChevronDown } from "lucide-react";

/** The one text-field style (inputs, selects, textareas). */
export const inputClass =
  "w-full rounded-xl border border-line bg-bg px-4 py-3 text-base outline-none transition focus:border-accent";

/** A small label above a field. */
export const labelClass = "text-sm font-medium";

/** One line of help or error text under a field. */
export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="text-sm text-danger-ink">
      {children}
    </p>
  );
}

const selectSizes = {
  md: "rounded-xl px-4 py-3 pr-10 text-base",
  sm: "h-9 rounded-lg px-2.5 pr-8 text-sm",
} as const;

/**
 * A themed select: the field style with our own chevron instead of the
 * browser's arrow. The open menu is the system's, which follows light and
 * dark mode through `color-scheme` (globals.css).
 */
export function Select({
  size = "md",
  className = "",
  children,
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: keyof typeof selectSizes }) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <select
        {...props}
        className={`w-full cursor-pointer appearance-none border border-line bg-bg text-ink outline-none transition hover:border-muted focus:border-accent ${selectSizes[size]}`}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted ${
          size === "sm" ? "right-2 size-4" : "right-3 size-5"
        }`}
      />
    </div>
  );
}

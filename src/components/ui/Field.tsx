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

/** One short status line (after an answer, a save, …). */
export function Notice({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "danger";
  children: React.ReactNode;
}) {
  const colors =
    tone === "success"
      ? "bg-success-soft text-success-ink"
      : tone === "danger"
        ? "bg-danger-soft text-danger-ink"
        : "bg-surface text-ink";
  return (
    <p role="status" className={`rounded-xl px-4 py-2.5 text-sm ${colors}`}>
      {children}
    </p>
  );
}

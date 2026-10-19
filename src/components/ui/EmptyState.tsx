import type { LucideIcon } from "lucide-react";

/** Nothing to show: an icon, one line, and at most one or two ways forward. */
export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-surface px-6 py-12 text-center">
      <Icon aria-hidden="true" className="size-9 text-muted" strokeWidth={1.6} />
      <h2 className="text-base font-semibold">{title}</h2>
      {children ? <div className="flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}

/** A titled block of a page, with an optional count. */
export function Section({
  title,
  count,
  id,
  action,
  children,
  className = "",
}: {
  title: string;
  count?: number;
  /** Used for the heading id and the region's label. */
  id: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-heading`} className="text-base font-semibold">
          {title}
          {count ? <span className="ml-2 font-normal text-muted">{count}</span> : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

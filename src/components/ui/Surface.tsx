/** The card surface: soft grey, no hard border. */
export function Surface({
  as: Tag = "div",
  className = "",
  children,
  ...rest
}: {
  as?: "div" | "article" | "section" | "li";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`rounded-2xl bg-surface p-4 ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

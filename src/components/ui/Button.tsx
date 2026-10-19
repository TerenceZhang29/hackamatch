import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "bg-surface text-ink hover:bg-surface-2",
  /** For buttons that sit on a grey card. */
  outline: "bg-bg text-ink ring-1 ring-line hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface",
  danger: "bg-danger-soft text-danger-ink hover:opacity-90",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-14 px-6 text-base",
};

/** The one button style. Class names only, for elements that can't use <Button>. */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
) {
  return `inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
};

/** A button, or a link styled as one when `href` is given. */
export function Button({
  variant,
  size,
  className = "",
  href,
  prefetch,
  ...rest
}: Common &
  (
    | ({ href: string; prefetch?: boolean } & Omit<
        React.ComponentProps<typeof Link>,
        "href" | "className"
      >)
    | ({ href?: undefined; prefetch?: undefined } & React.ButtonHTMLAttributes<HTMLButtonElement>)
  )) {
  const cls = buttonClass(variant, size, className);
  if (href !== undefined) {
    return <Link href={href} prefetch={prefetch} className={cls} {...(rest as object)} />;
  }
  return (
    <button
      type="button"
      className={cls}
      {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    />
  );
}

/** A round icon-only button; `label` is its accessible name. */
export function IconButton({
  label,
  variant = "secondary",
  size = 44,
  className = "",
  children,
  ...rest
}: {
  label: string;
  variant?: ButtonVariant;
  size?: 36 | 44 | 64;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const dims = size === 64 ? "size-16" : size === 44 ? "size-11" : "size-9";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full transition ${VARIANTS[variant]} ${dims} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

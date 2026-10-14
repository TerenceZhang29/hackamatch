import Link from "next/link";

export type Viewer = "anon" | "not-onboarded" | "onboarded";

/**
 * What a card offers each kind of viewer. Logged-out visitors go through
 * /join (which records the click) to sign in and come back to this card.
 */
export function CardActions({
  viewer,
  cardPath,
  onboarded,
}: {
  viewer: Viewer;
  cardPath: string;
  /** Rendered for onboarded viewers (Interested / Pass). */
  onboarded?: React.ReactNode;
}) {
  if (viewer === "onboarded") return <>{onboarded}</>;
  const href =
    viewer === "anon"
      ? `/join?${new URLSearchParams({ next: cardPath, from: "card" })}`
      : "/onboarding";
  return (
    <div className="flex gap-2">
      <Link
        href={href}
        prefetch={false}
        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        {viewer === "anon" ? "Interested" : "Finish joining to connect"}
      </Link>
    </div>
  );
}

import Link from "next/link";
import type { Viewer } from "./CardActions";

/** One placeholder card; grey bars only, so no hidden person's details reach the page. */
function PlaceholderCard({ className = "" }: { className?: string }) {
  return (
    <li className={className}>
      <div className="flex h-full flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="h-3 w-20 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-4 w-28 rounded bg-neutral-300 dark:bg-neutral-700" />
        <div className="h-3 w-full rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="h-3 w-4/5 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="flex gap-1.5">
          <div className="h-5 w-14 rounded-full bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-5 w-16 rounded-full bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-5 w-12 rounded-full bg-neutral-200 dark:bg-neutral-800" />
        </div>
        <div className="h-8 w-24 rounded-lg bg-neutral-300 dark:bg-neutral-700" />
      </div>
    </li>
  );
}

/**
 * Shown under a capped list to visitors who aren't members yet: one blurred
 * row of placeholder cards, so it's clear there are more, with a sign-in (or
 * finish-joining) button that comes back to `next` and shows the whole list.
 */
export function SeeAllPrompt({
  viewer,
  next,
  what,
}: {
  viewer: Exclude<Viewer, "onboarded">;
  next: string;
  /** Completes "See all": "12 people going", "ideas for this event". */
  what: string;
}) {
  const href =
    viewer === "anon"
      ? `/join?${new URLSearchParams({ next, from: "see-all" })}`
      : `/onboarding?${new URLSearchParams({ next })}`;
  return (
    <div className="relative">
      {/* The row matches the card grid: 1, 2 or 3 placeholders by screen width. */}
      <ul
        aria-hidden="true"
        className="pointer-events-none grid gap-4 blur-[3px] select-none sm:grid-cols-2 lg:grid-cols-3"
      >
        <PlaceholderCard />
        <PlaceholderCard className="hidden sm:block" />
        <PlaceholderCard className="hidden lg:block" />
      </ul>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-transparent via-[var(--background)]/70 to-[var(--background)] px-4 text-center">
        <p className="text-lg font-semibold">See all {what}</p>
        <Link
          href={href}
          prefetch={false}
          className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white shadow-sm dark:bg-neutral-100 dark:text-neutral-900"
        >
          {viewer === "anon" ? "Sign in with your Cornell email" : "Finish joining"}
        </Link>
      </div>
    </div>
  );
}

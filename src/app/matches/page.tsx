import { requireOnboarded } from "@/lib/auth";

// Placeholder until the matches list lands in P1-11.
export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string | string[] }>;
}) {
  const user = await requireOnboarded("/matches");
  const welcome = (await searchParams).welcome !== undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-4 py-16">
      {welcome ? (
        <p
          role="status"
          className="rounded-lg bg-neutral-100 px-4 py-3 text-sm dark:bg-neutral-900"
        >
          You&apos;re in the pool. We&apos;ll send you people to build with.
        </p>
      ) : null}
      <h1 className="text-3xl font-bold tracking-tight">Your matches</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        You&apos;re signed in as <span className="font-medium break-all">{user.cornell_email}</span>
        . Matches are coming soon.
      </p>
      <form action="/logout" method="post">
        <button type="submit" className="text-sm underline">
          Sign out
        </button>
      </form>
    </main>
  );
}

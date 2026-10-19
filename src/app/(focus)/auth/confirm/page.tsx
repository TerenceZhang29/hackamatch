import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sanitizeNext } from "@/lib/auth-helpers";
import { confirmSignIn } from "./actions";

export const metadata: Metadata = {
  title: "Sign in · HackaMatch",
  // The URL holds a sign-in token: keep it out of search indexes and referrers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Landing page for magic links. Loading it verifies nothing; the button posts
 * to `confirmSignIn`, which does. See docs/IMPLEMENTATION_PLAN.md P1-03.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string | string[]; next?: string | string[] }>;
}) {
  const params = await searchParams;
  const tokenHash = first(params.token_hash);
  const next = sanitizeNext(first(params.next));

  if (!tokenHash) {
    const login = new URLSearchParams({ error: "link" });
    if (next) login.set("next", next);
    redirect(`/login?${login}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-16">
      <form action={confirmSignIn} className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Almost there</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Press the button to finish signing in.
        </p>
        <input type="hidden" name="token_hash" value={tokenHash} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <button
          type="submit"
          autoFocus
          className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Continue to HackaMatch
        </button>
      </form>
    </main>
  );
}

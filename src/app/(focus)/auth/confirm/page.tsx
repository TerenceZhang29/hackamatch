import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sanitizeNext } from "@/lib/auth-helpers";
import { buttonClass } from "@/components/ui/Button";
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
    <main className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-sm flex-col justify-center px-4 py-10">
      <form action={confirmSignIn} className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold tracking-tight">Almost there</h1>
        <input type="hidden" name="token_hash" value={tokenHash} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <button type="submit" autoFocus className={buttonClass("primary", "lg")}>
          Continue to HackaMatch
        </button>
      </form>
    </main>
  );
}

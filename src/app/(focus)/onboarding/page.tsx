import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupFlow } from "@/components/signup/SignupFlow";
import { requireUser } from "@/lib/auth";
import { sanitizeNext } from "@/lib/auth-helpers";
import { splitName } from "@/lib/display-name";
import { eventFromJoinPath, listUpcomingEvents } from "@/server/events";
import { getPendingSignup } from "@/server/signup";
import { submitOnboarding } from "../signup/actions";

export const metadata: Metadata = { title: "Join · HackaMatch" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * For someone signed in who hasn't joined yet (P1-24): the sign-up steps
 * without the email. If they gave their answers on `/signup`, those are shown
 * on `/signup/finish` instead.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = sanitizeNext(first((await searchParams).next));
  const user = await requireUser(
    next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding",
  );
  if (user.onboarded_at) redirect(next ?? "/");
  if (await getPendingSignup(user.cornell_email)) redirect("/signup/finish");

  const [events, joinEventId] = await Promise.all([listUpcomingEvents(), eventFromJoinPath(next)]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-4 pt-2 pb-12">
      <SignupFlow
        events={events}
        initialEventIds={joinEventId ? [joinEventId] : []}
        initialName={splitName(user.name)}
        askEmail={false}
        submit={submitOnboarding}
      />
      <form action="/logout" method="post" className="mt-10 text-center text-sm text-muted">
        Signed in as <span className="break-all">{user.cornell_email}</span> ·{" "}
        <button type="submit" className="underline">
          Sign out
        </button>
      </form>
    </main>
  );
}

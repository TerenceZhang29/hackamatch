import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sanitizeNext } from "@/lib/auth-helpers";
import { slugsOf } from "@/lib/taxonomy/skills";
import { eventFromJoinPath, listUpcomingEvents } from "@/server/events";
import { OnboardingFlow } from "./OnboardingFlow";

export const metadata: Metadata = { title: "Join · HackaMatch" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = sanitizeNext(first((await searchParams).next));
  const user = await requireUser(
    next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding",
  );
  if (user.onboarded_at) redirect(next ?? "/matches");

  const [events, joinEventId] = await Promise.all([listUpcomingEvents(), eventFromJoinPath(next)]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12">
      <OnboardingFlow
        initial={{
          name: user.name ?? "",
          role: user.role,
          intents: user.intents,
          sentence: user.raw_bio ?? "",
        }}
        events={events}
        initialEventIds={joinEventId ? [joinEventId] : []}
        next={next}
        suggestions={{
          skills: slugsOf("skills"),
          stack: slugsOf("stack"),
          domains: slugsOf("domains"),
        }}
      />
      <form action="/logout" method="post" className="mt-10 text-center text-sm text-neutral-500">
        Signed in as <span className="break-all">{user.cornell_email}</span> ·{" "}
        <button type="submit" className="underline">
          Sign out
        </button>
      </form>
    </main>
  );
}

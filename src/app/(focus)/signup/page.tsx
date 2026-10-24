import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupFlow } from "@/components/signup/SignupFlow";
import { getUser } from "@/lib/auth";
import { listUpcomingEvents } from "@/server/events";
import { startSignup } from "./actions";

export const metadata: Metadata = { title: "Join · HackaMatch" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Sign-up (P1-24): hackathons, areas, skills, then name and email last.
 * `?event=<slug>` (from an event page) ticks that hackathon on step 1.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string | string[] }>;
}) {
  const user = await getUser();
  if (user?.onboarded_at) redirect("/");
  if (user) redirect("/onboarding");
  const slug = first((await searchParams).event);
  const events = await listUpcomingEvents();
  const preset = events.find((event) => event.slug === slug);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col px-4 pt-2 pb-12">
      <SignupFlow
        events={events}
        initialEventIds={preset ? [preset.id] : []}
        initialName={{ firstName: "", lastName: "" }}
        askEmail
        submit={startSignup}
      />
    </main>
  );
}

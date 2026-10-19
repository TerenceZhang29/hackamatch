import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { formatDateRange } from "@/lib/time";
import { countEventInterest, listEventInterestIds, listUpcomingEvents } from "@/server/events";

export const metadata: Metadata = { title: "Upcoming hackathons · HackaMatch" };

/** Every upcoming hackathon, soonest first, each linking to its event page. */
export default async function EventsPage() {
  const user = await getUser();
  const onboarded = Boolean(user?.onboarded_at);
  const [events, interests] = await Promise.all([
    listUpcomingEvents(),
    onboarded ? listEventInterestIds(user!.id) : Promise.resolve([]),
  ]);
  const counts = await Promise.all(events.map((event) => countEventInterest(event.id)));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-tight">
          HackaMatch
        </Link>
        {user ? null : (
          <Link href="/login" className="text-sm underline">
            Sign in
          </Link>
        )}
      </header>
      <Link href="/" className="self-start text-sm underline">
        ← Back to the board
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Upcoming hackathons</h1>

      {events.length ? (
        <ul className="flex flex-col gap-3">
          {events.map((event, index) => {
            const count = counts[index]!;
            return (
              <li key={event.id}>
                <Link
                  href={`/e/${event.slug}`}
                  className="flex flex-col gap-1 rounded-xl border border-neutral-200 p-4 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600"
                >
                  <span className="text-lg font-semibold">{event.name}</span>
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">
                    {formatDateRange(event.start_date, event.end_date)} · Teams of{" "}
                    {event.team_size_min}–{event.team_size_max}
                  </span>
                  <span className="text-sm">
                    {count === 1 ? "1 person" : `${count} people`} looking for a team
                    {interests.includes(event.id) ? (
                      <span className="font-medium"> · You&apos;re going</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-neutral-500">No upcoming hackathons yet.</p>
      )}
    </main>
  );
}

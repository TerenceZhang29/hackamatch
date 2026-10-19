import { CalendarX, Check, ChevronRight, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { getUser } from "@/lib/auth";
import { formatDateRange } from "@/lib/time";
import { countEventInterest, listEventInterestIds, listUpcomingEvents } from "@/server/events";

export const metadata: Metadata = { title: "Upcoming hackathons · HackaMatch" };

/** "NOV" and "9" from "2026-11-09", without time zone shifts. */
function dateBadge(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return {
    month: date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(),
    day: String(day),
  };
}

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
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Upcoming hackathons</h1>

      {events.length ? (
        <ul className="flex flex-col gap-2">
          {events.map((event, index) => {
            const count = counts[index]!;
            const badge = dateBadge(event.start_date);
            const going = interests.includes(event.id);
            return (
              <li key={event.id}>
                <Link
                  href={`/e/${event.slug}`}
                  className="flex items-center gap-4 rounded-2xl bg-surface p-3 transition hover:bg-surface-2"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-bg leading-none"
                  >
                    <span className="text-[10px] font-semibold text-accent">{badge.month}</span>
                    <span className="text-xl font-bold">{badge.day}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-semibold">{event.name}</span>
                    <span className="text-xs text-muted">
                      {formatDateRange(event.start_date, event.end_date)} · Teams of{" "}
                      {event.team_size_min}–{event.team_size_max}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <Chip>
                        <Users aria-hidden="true" className="size-3" />
                        {count} looking
                      </Chip>
                      {going ? (
                        <Chip tone="success">
                          <Check aria-hidden="true" className="size-3" strokeWidth={3} />
                          You&apos;re going
                        </Chip>
                      ) : null}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={CalendarX} title="No upcoming hackathons yet." />
      )}
    </main>
  );
}

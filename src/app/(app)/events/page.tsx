import { CalendarX, Check, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { getUser } from "@/lib/auth";
import { dateTile } from "@/lib/person-card";
import { formatEventDates } from "@/lib/time";
import { listEventInterestIds, listUpcomingEvents, type EventSummary } from "@/server/events";

export const metadata: Metadata = { title: "Upcoming hackathons · HackaMatch" };

function EventRow({ event, going }: { event: EventSummary; going: boolean }) {
  const { month, day } = dateTile(event.start_date);
  return (
    <li>
      <Link
        href={`/e/${event.slug}`}
        className={`flex items-center gap-3.5 rounded-[18px] border-2 bg-bg p-3 transition hover:bg-surface-2 ${
          going ? "border-green-500" : "border-transparent shadow-[0_1px_3px_rgba(22,22,26,0.06)]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`flex h-14 w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl leading-none ${
            going ? "bg-success-soft" : "bg-accent-soft"
          }`}
        >
          <span
            className={`text-[11px] font-bold tracking-[0.06em] ${
              going ? "text-success-ink" : "text-accent"
            }`}
          >
            {month}
          </span>
          <span className="text-xl font-extrabold">{day}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="leading-snug font-bold">{event.name}</span>
          <span className="text-[13px] text-muted">
            {formatEventDates(event.start_date, event.end_date)}
          </span>
          {going ? (
            <span className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-success-ink">
              <Check aria-hidden="true" className="size-3" strokeWidth={3} />
              You&apos;re going
            </span>
          ) : null}
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted" />
      </Link>
    </li>
  );
}

const sectionTitle = "text-xs font-semibold tracking-[0.06em] text-muted uppercase";

/**
 * Every upcoming hackathon (P1-24): the ones the member is going to first,
 * then the rest under a divider, soonest first. Each opens its details page.
 */
export default async function EventsPage() {
  const user = await getUser();
  const onboarded = Boolean(user?.onboarded_at);
  const [events, interests] = await Promise.all([
    listUpcomingEvents(),
    onboarded ? listEventInterestIds(user!.id) : Promise.resolve([]),
  ]);
  const mine = events.filter((event) => interests.includes(event.id));
  const others = events.filter((event) => !interests.includes(event.id));

  return (
    // A light grey page, like the mockup.
    <main className="min-h-[calc(100dvh-3.5rem)] bg-surface px-4 py-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.03em]">
          Upcoming hackathons
        </h1>

        {events.length === 0 ? (
          <EmptyState icon={CalendarX} title="No upcoming hackathons yet." />
        ) : (
          <>
            {mine.length ? (
              <section aria-labelledby="going-heading" className="flex flex-col gap-2.5">
                <h2 id="going-heading" className={sectionTitle}>
                  You&apos;re going
                </h2>
                <ul className="flex flex-col gap-2.5">
                  {mine.map((event) => (
                    <EventRow key={event.id} event={event} going />
                  ))}
                </ul>
              </section>
            ) : null}
            {others.length ? (
              <section
                aria-labelledby="more-heading"
                className={`flex flex-col gap-2.5 ${mine.length ? "mt-1 border-t border-line pt-[18px]" : ""}`}
              >
                <h2 id="more-heading" className={sectionTitle}>
                  {mine.length ? "More hackathons" : "All hackathons"}
                </h2>
                <ul className="flex flex-col gap-2.5">
                  {others.map((event) => (
                    <EventRow key={event.id} event={event} going={false} />
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

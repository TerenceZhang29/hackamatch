import { CalendarX, Check, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { getUser } from "@/lib/auth";
import { dateTile } from "@/lib/person-card";
import { getConfig } from "@/lib/config";
import { FORMAT_LABELS, LEVEL_LABELS, shortDollars } from "@/lib/event-details";
import { formatEventDates, localDateString } from "@/lib/time";
import {
  eventGoingStats,
  listEventInterestIds,
  listUpcomingEventItems,
  type EventListItem,
} from "@/server/events";

export const metadata: Metadata = { title: "Upcoming hackathons · HackaMatch" };

const chip = "inline-flex h-[26px] items-center rounded-full px-2.5 text-[13px] font-medium";

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * One hackathon on the list: name and dates, then the facts people compare
 * on (P1-25: prize total, length, level, cost) and how many are going. Only
 * what's known is shown, so an event without details looks as before.
 */
function EventRow({
  event,
  going,
  stats,
  today,
}: {
  event: EventListItem;
  going: boolean;
  /** Going and need-a-team counts; need-a-team is null for visitors. */
  stats: { going: number; needTeam: number | null };
  today: string;
}) {
  const { month, day } = dateTile(event.start_date);
  const where = [event.format ? FORMAT_LABELS[event.format] : null, event.venue]
    .filter(Boolean)
    .join(" · ");
  const facts = [
    event.length_hours ? `${event.length_hours} hours` : null,
    event.level ? LEVEL_LABELS[event.level] : null,
    event.entry_fee_cents === null
      ? null
      : event.entry_fee_cents === 0
        ? "Free"
        : `${shortDollars(event.entry_fee_cents)} entry`,
  ].filter((fact): fact is string => fact !== null);
  const applyOpen = event.apply_by !== null && event.apply_by >= today;
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
            {[formatEventDates(event.start_date, event.end_date), where]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {event.prize_total_cents !== null || facts.length ? (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {event.prize_total_cents !== null ? (
                <span
                  className={`${chip} bg-amber-100 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200`}
                >
                  {shortDollars(event.prize_total_cents)} prizes
                </span>
              ) : null}
              {facts.map((fact) => (
                <span key={fact} className={`${chip} bg-surface`}>
                  {fact}
                </span>
              ))}
            </span>
          ) : null}
          {stats.going || applyOpen ? (
            <span className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[13px]">
              <span className="text-muted">
                <strong className="text-ink">{stats.going}</strong> going
                {stats.needTeam !== null && stats.going ? ` · ${stats.needTeam} need a team` : ""}
              </span>
              {applyOpen ? (
                <span className="font-semibold text-amber-800 dark:text-amber-300">
                  Apply by {shortDate(event.apply_by!)}
                </span>
              ) : null}
            </span>
          ) : null}
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
    listUpcomingEventItems(),
    onboarded ? listEventInterestIds(user!.id) : Promise.resolve([]),
  ]);
  const stats = await eventGoingStats(events.map((event) => event.id));
  const today = localDateString(getConfig().APP_TIMEZONE);
  const statsFor = (id: string) => {
    const s = stats.get(id);
    // How many still need a team is for members, like on the event page.
    return { going: s?.going ?? 0, needTeam: onboarded ? (s?.needTeam ?? 0) : null };
  };
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
                    <EventRow
                      key={event.id}
                      event={event}
                      going
                      stats={statsFor(event.id)}
                      today={today}
                    />
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
                    <EventRow
                      key={event.id}
                      event={event}
                      going={false}
                      stats={statsFor(event.id)}
                      today={today}
                    />
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

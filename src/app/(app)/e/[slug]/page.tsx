import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Check, Users } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  EventGlance,
  EventGoingSkills,
  EventIncluded,
  EventJudging,
  EventPrizes,
  EventSchedule,
  EventTracks,
} from "@/components/EventDetails";
import { Choice, EventPoolPanel } from "@/components/EventPool";
import { DateTile } from "@/components/PersonLines";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Chip";
import { getUser } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { detailsFromRow } from "@/lib/event-details";
import { displayLabel } from "@/lib/taxonomy/labels";
import { localDateString } from "@/lib/time";
import { listBoardPeople } from "@/server/board";
import {
  addEventInterests,
  countEventInterest,
  eventGoingStats,
  eventTopSkills,
  getEventBySlug,
  getEventPool,
  hasEnded,
} from "@/server/events";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const event = await getEventBySlug((await params).slug);
  return { title: event ? `${event.name} · HackaMatch` : "HackaMatch" };
}

/**
 * An event's details (P1-24, P1-25), and the link organizers share: the
 * name, host, description and areas; at a glance (when, where, teams, cost,
 * who can join, level, links, apply by and the apply button); tracks; who's
 * going (hidden at 0); prizes, judging, schedule and what's included, each
 * hidden when empty. "I'm going!"
 * and "Discover who's going" float at the bottom; Discover opens filtered on
 * the event (members) or sign-up with the event ticked (visitors).
 * `?join=1` (where sign-in returns) tags the event for an onboarded member.
 */
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ join?: string; confirm?: string }>;
}) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const ended = hasEnded(event);
  const user = await getUser();
  const member = Boolean(user?.onboarded_at);
  const joinPath = `/e/${slug}?join=1`;
  const query = await searchParams;

  if (query.join === "1" && member && !ended) {
    await addEventInterests(user!.id, [event.id]);
    redirect(`/e/${slug}`);
  }

  const [count, pool, faces, stats, skills] = await Promise.all([
    countEventInterest(event.id),
    member ? getEventPool(user!.id, event.id) : Promise.resolve(null),
    // A few faces for members; who's going is for members only.
    member
      ? listBoardPeople({ event: slug, domain: null, skill: null }, 3, [user!.id])
      : Promise.resolve(null),
    member ? eventGoingStats([event.id]) : Promise.resolve(null),
    member ? eventTopSkills(event.id) : Promise.resolve([]),
  ]);
  const going = pool?.going ?? false;
  const details = detailsFromRow(event);
  const today = localDateString(getConfig().APP_TIMEZONE);
  const needTeam = stats?.get(event.id)?.needTeam ?? null;
  const applyHref = details.applyUrl ?? event.url;
  const apply =
    applyHref && !ended
      ? {
          href: applyHref,
          label: details.applyUrl ? "Apply on the event site" : "Register on the event site",
        }
      : null;
  const discoverHref = member
    ? `/?event=${slug}`
    : user
      ? `/onboarding?${new URLSearchParams({ next: joinPath })}`
      : `/signup?${new URLSearchParams({ event: slug })}`;

  return (
    // A light grey page, like the mockup. Room at the bottom for the floating buttons.
    <main className="min-h-[calc(100dvh-3.5rem)] bg-surface px-4 pt-3">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 pb-6">
        <Link
          href="/events"
          className="-ml-2 inline-flex h-10 items-center gap-1 self-start rounded-[10px] px-2.5 text-[15px] font-medium"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
          Events
        </Link>

        <article
          aria-labelledby="event-name"
          className={`flex flex-col gap-4 rounded-3xl border-2 bg-bg px-5 py-[22px] ${
            going ? "border-green-500" : "border-transparent shadow-[0_1px_3px_rgba(22,22,26,0.06)]"
          }`}
        >
          <div className="flex items-start gap-3.5">
            <DateTile isoDate={event.start_date} shared={going} large />
            <div className="flex flex-col gap-1">
              <h1
                id="event-name"
                className="text-[26px] leading-[1.15] font-extrabold tracking-[-0.02em]"
              >
                {event.name}
              </h1>
              {event.host ? (
                <span className="text-sm text-muted">Hosted by {event.host}</span>
              ) : null}
              {going ? (
                <span className="flex items-center gap-1 text-[13px] font-semibold text-success-ink">
                  <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                  You&apos;re going
                </span>
              ) : null}
            </div>
          </div>
          {event.description ? (
            <p className="text-[15px] leading-normal text-zinc-700 dark:text-zinc-300">
              {event.description}
            </p>
          ) : null}
          {event.domains.length ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Areas">
              {event.domains.map((slug) => (
                <li key={slug}>
                  <span className="inline-flex h-[30px] items-center rounded-full bg-surface px-3 text-sm font-medium">
                    {displayLabel(slug)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </article>

        <EventGlance event={event} details={details} today={today} apply={apply} />

        {member && going && !ended ? (
          <EventPoolPanel
            eventId={event.id}
            eventName={event.name}
            slug={slug}
            pool={pool!}
            confirmNotGoing={query.confirm === "not-going"}
          />
        ) : null}

        <EventTracks details={details} />

        {/* Hidden while nobody on HackaMatch is going (owner, 2026-11-03). */}
        {count > 0 ? (
          <section
            aria-labelledby="going-heading"
            className="flex flex-col gap-3.5 rounded-3xl bg-bg p-5 shadow-[0_1px_3px_rgba(22,22,26,0.06)]"
          >
            <h2
              id="going-heading"
              className="text-xs font-semibold tracking-[0.06em] text-muted uppercase"
            >
              Who&apos;s going on HackaMatch
            </h2>
            <p className="flex items-center gap-3">
              {faces?.rows.length ? (
                <span aria-hidden="true" className="flex -space-x-1.5">
                  {faces.rows.map((person) => (
                    <span key={person.user_id} className="rounded-full ring-2 ring-bg">
                      <Avatar name={person.display_name} size={32} />
                    </span>
                  ))}
                </span>
              ) : (
                <Users aria-hidden="true" className="size-5 text-muted" />
              )}
              <span className="flex flex-wrap items-baseline gap-x-1.5 text-base">
                <span>
                  <strong className="text-xl font-extrabold">{count}</strong>{" "}
                  {count === 1 ? "person" : "people"} going{going ? ", including you" : ""}
                </span>
                {needTeam !== null && count > 0 ? (
                  <span className="basis-full text-[15px] text-muted">
                    {needTeam} still need a team
                  </span>
                ) : null}
              </span>
            </p>
            {/* Counts only, and only from 5 people, so the bars can't point at anyone. */}
            {member && count >= 5 ? <EventGoingSkills skills={skills} /> : null}
          </section>
        ) : null}

        <EventPrizes details={details} />
        <EventJudging details={details} />
        <EventSchedule details={details} />
        <EventIncluded details={details} />

        {event.details_updated_at ? (
          <p className="px-1 text-[13px] text-muted">
            Details from the organizer&apos;s site, updated{" "}
            {new Date(event.details_updated_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </p>
        ) : null}

        {ended ? <Chip>This event has ended.</Chip> : null}
      </div>

      {ended ? null : (
        // Floats above the tab bar while the page scrolls (owner, 2026-11-02), over a fade.
        <div className="sticky bottom-16 z-10 -mx-4 bg-[linear-gradient(to_bottom,transparent,var(--color-surface)_45%)] px-4 pt-7 pb-3 sm:bottom-0">
          <div className="mx-auto flex w-full max-w-xl gap-2.5">
            {member && !going ? (
              <Choice
                eventId={event.id}
                choice="going"
                returnTo={`/e/${slug}`}
                className="flex h-[52px] shrink-0 items-center justify-center rounded-[14px] bg-bg px-[18px] text-base font-bold text-success-ink shadow-[0_6px_16px_rgba(22,22,26,0.1)] ring-2 ring-green-600 transition ring-inset hover:bg-success-soft"
              >
                I&apos;m going!
              </Choice>
            ) : null}
            <Link
              href={discoverHref}
              prefetch={false}
              className="flex h-[52px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-accent text-base font-bold text-accent-ink shadow-[0_8px_20px_rgba(79,70,229,0.28)] transition hover:opacity-90"
            >
              Discover who&apos;s going
              <ArrowRight aria-hidden="true" className="size-[17px]" strokeWidth={2.25} />
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}

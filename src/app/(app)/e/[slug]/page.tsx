import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  ExternalLink,
  Landmark,
  MapPin,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EventPoolPanel } from "@/components/EventPool";
import { DateTile } from "@/components/PersonLines";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Chip";
import { getUser } from "@/lib/auth";
import { displayLabel } from "@/lib/taxonomy/labels";
import { formatEventDates } from "@/lib/time";
import { listBoardPeople } from "@/server/board";
import {
  addEventInterests,
  countEventInterest,
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

function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <dt className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface text-accent">
        {icon}
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="flex min-h-9 flex-col justify-center text-[15px] font-semibold">{children}</dd>
    </div>
  );
}

/**
 * An event's details (P1-24), and the link organizers share: area tags, when,
 * where, host, description and how many are going; "I'm going!"; and
 * "Discover who's going", which opens Discover filtered on the event (members)
 * or sign-up with the event ticked (visitors). `?join=1` (where sign-in
 * returns) tags the event for an onboarded member.
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

  const [count, pool, faces] = await Promise.all([
    countEventInterest(event.id),
    member ? getEventPool(user!.id, event.id) : Promise.resolve(null),
    // A few faces for members; who's going is for members only.
    member
      ? listBoardPeople({ event: slug, domain: null, skill: null }, 3, [user!.id])
      : Promise.resolve(null),
  ]);
  const going = pool?.going ?? false;
  const discoverHref = member
    ? `/?event=${slug}`
    : user
      ? `/onboarding?${new URLSearchParams({ next: joinPath })}`
      : `/signup?${new URLSearchParams({ event: slug })}`;

  return (
    // A light grey page, like the mockup.
    <main className="min-h-[calc(100dvh-3.5rem)] bg-surface px-4 pt-3 pb-6">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <Link
          href="/events"
          className="-ml-2 inline-flex h-10 items-center gap-1 self-start rounded-[10px] px-2.5 text-[15px] font-medium"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
          Events
        </Link>

        <article
          aria-labelledby="event-name"
          className={`flex flex-col gap-[18px] rounded-3xl border-2 bg-bg px-5 py-[22px] ${
            going ? "border-green-500" : "border-transparent shadow-[0_1px_3px_rgba(22,22,26,0.06)]"
          }`}
        >
          <div className="flex items-start gap-3.5">
            <DateTile isoDate={event.start_date} shared={going} large />
            <div className="flex flex-col gap-1.5">
              <h1
                id="event-name"
                className="text-[26px] leading-[1.15] font-extrabold tracking-[-0.02em]"
              >
                {event.name}
              </h1>
              {going ? (
                <span className="flex items-center gap-1 text-[13px] font-semibold text-success-ink">
                  <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                  You&apos;re going
                </span>
              ) : null}
            </div>
          </div>

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

          <dl className="flex flex-col gap-3">
            <Fact icon={<Clock aria-hidden="true" className="size-4" />} label="When">
              <span>{formatEventDates(event.start_date, event.end_date)}</span>
              {event.time_label ? (
                <span className="font-normal text-muted">{event.time_label}</span>
              ) : null}
            </Fact>
            {event.venue ? (
              <Fact icon={<MapPin aria-hidden="true" className="size-4" />} label="Where">
                {event.venue}
              </Fact>
            ) : null}
            {event.host ? (
              <Fact icon={<Landmark aria-hidden="true" className="size-4" />} label="Host">
                Hosted by {event.host}
              </Fact>
            ) : null}
          </dl>

          {event.description ? (
            <p className="text-[15px] leading-normal text-zinc-700 dark:text-zinc-300">
              {event.description}
            </p>
          ) : null}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span>
              Teams of {event.team_size_min}–{event.team_size_max}
            </span>
            {event.url ? (
              <a
                href={event.url}
                className="inline-flex items-center gap-1 underline"
                rel="noopener noreferrer"
              >
                <ExternalLink aria-hidden="true" className="size-3" />
                Event site
              </a>
            ) : null}
          </p>
        </article>

        <p className="flex items-center gap-3 px-1">
          {faces?.rows.length ? (
            <span aria-hidden="true" className="flex -space-x-1.5">
              {faces.rows.map((person) => (
                <span key={person.user_id} className="rounded-full ring-2 ring-surface">
                  <Avatar name={person.display_name} size={32} />
                </span>
              ))}
            </span>
          ) : (
            <Users aria-hidden="true" className="size-5 text-muted" />
          )}
          <span className="text-base">
            <strong className="text-xl font-extrabold">{count}</strong>{" "}
            {count === 1 ? "person" : "people"} going{going ? ", including you" : ""}
          </span>
        </p>

        {ended ? (
          <Chip>This event has ended.</Chip>
        ) : (
          <>
            {member ? (
              <EventPoolPanel
                eventId={event.id}
                eventName={event.name}
                slug={slug}
                pool={pool!}
                confirmNotGoing={query.confirm === "not-going"}
              />
            ) : null}
            <Link
              href={discoverHref}
              prefetch={false}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[14px] bg-accent text-[17px] font-bold text-accent-ink shadow-[0_8px_20px_rgba(79,70,229,0.28)] transition hover:opacity-90"
            >
              Discover who&apos;s going
              <ArrowRight aria-hidden="true" className="size-[18px]" strokeWidth={2.25} />
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

import {
  CalendarClock,
  Check,
  Clock,
  ExternalLink,
  Globe,
  GraduationCap,
  MapPin,
  MessageCircle,
  Sprout,
  Tag,
  Trophy,
  Users,
} from "lucide-react";
import {
  ADMISSION_LABELS,
  FORMAT_LABELS,
  LEVEL_LABELS,
  PERK_LABELS,
  formatDollars,
  type EventDetails,
} from "@/lib/event-details";
import { displayLabel } from "@/lib/taxonomy/labels";
import { formatEventDates } from "@/lib/time";

/**
 * The event page's detail sections (P1-25, docs/plans/p1-25-event-details.md),
 * per the mockup canvas page "Event details: more info". Each one renders
 * nothing when its details are empty.
 */

const card = "flex flex-col gap-3.5 rounded-3xl bg-bg p-5 shadow-[0_1px_3px_rgba(22,22,26,0.06)]";
const heading = "text-xs font-semibold tracking-[0.06em] text-muted uppercase";

function Glance({
  icon: Icon,
  label,
  children,
  note,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[3px]">
      <dt className="flex items-center gap-1.5 text-[13px] text-muted">
        <Icon aria-hidden="true" className="size-[15px] text-accent" />
        {label}
      </dt>
      <dd className="text-[15px] font-semibold break-words">{children}</dd>
      {note ? <dd className="text-[13px] text-muted">{note}</dd> : null}
    </div>
  );
}

function SiteLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 text-accent-soft-ink underline"
    >
      <span className="truncate">{children}</span>
      <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
    </a>
  );
}

/** "healthaibuild.org" from a link. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Whole days from `today` to `date` (both YYYY-MM-DD). */
export function daysUntil(today: string, date: string): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
}

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** At a glance: the facts people compare hackathons on, and the apply-by line. */
export function EventGlance({
  event,
  details,
  today,
}: {
  event: {
    start_date: string;
    end_date: string;
    time_label: string | null;
    venue: string | null;
    team_size_min: number;
    team_size_max: number;
    url: string | null;
  };
  details: EventDetails;
  today: string;
}) {
  const where = details.format ? FORMAT_LABELS[details.format] : null;
  const cost =
    details.entryFeeCents === null
      ? null
      : details.entryFeeCents === 0
        ? "Free"
        : `${formatDollars(details.entryFeeCents)} entry`;
  const applyIn = details.applyBy ? daysUntil(today, details.applyBy) : null;
  return (
    <section aria-labelledby="glance-heading" className={card}>
      <h2 id="glance-heading" className={heading}>
        At a glance
      </h2>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3.5">
        <Glance icon={Clock} label="When" note={event.time_label}>
          {formatEventDates(event.start_date, event.end_date)}
        </Glance>
        {where || event.venue ? (
          <Glance icon={MapPin} label="Where" note={where ? event.venue : null}>
            {where ?? event.venue}
          </Glance>
        ) : null}
        <Glance
          icon={Users}
          label="Teams"
          note={details.lengthHours ? `${details.lengthHours} hours of hacking` : null}
        >
          {event.team_size_min === event.team_size_max
            ? `${event.team_size_min} people`
            : `${event.team_size_min}–${event.team_size_max} people`}
        </Glance>
        {cost ? (
          <Glance icon={Tag} label="Cost">
            {cost}
          </Glance>
        ) : null}
        {details.openTo ? (
          <Glance icon={GraduationCap} label="Open to">
            {details.openTo}
          </Glance>
        ) : null}
        {details.level ? (
          <Glance icon={Sprout} label="Level">
            {LEVEL_LABELS[details.level]}
          </Glance>
        ) : null}
        {event.url ? (
          <Glance icon={Globe} label="Event site">
            <SiteLink href={event.url}>{hostOf(event.url)}</SiteLink>
          </Glance>
        ) : null}
        {details.chatUrl ? (
          <Glance icon={MessageCircle} label="Chat">
            <SiteLink href={details.chatUrl}>{hostOf(details.chatUrl)}</SiteLink>
          </Glance>
        ) : null}
      </dl>
      {details.applyBy && applyIn !== null ? (
        <div className="flex items-start gap-2.5 rounded-[14px] bg-amber-100 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <CalendarClock aria-hidden="true" className="mt-px size-[18px] shrink-0" />
          <p className="flex flex-col gap-px">
            <span className="text-sm font-bold">
              {applyIn < 0
                ? `Applications closed ${shortDate(details.applyBy)}`
                : `Apply by ${shortDate(details.applyBy)} · ${
                    applyIn === 0
                      ? "last day"
                      : applyIn === 1
                        ? "1 day left"
                        : `${applyIn} days left`
                  }`}
            </span>
            {details.admission || details.capacity ? (
              <span className="text-[13px]">
                {[
                  details.capacity ? `${details.capacity.toLocaleString("en-US")} spots` : null,
                  details.admission ? ADMISSION_LABELS[details.admission] : null,
                ]
                  .filter(Boolean)
                  .join(". ")}
                .
              </span>
            ) : null}
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** Tracks: what to build, and the skills that help. */
export function EventTracks({ details }: { details: EventDetails }) {
  if (!details.tracks.length && !details.tools) return null;
  return (
    <section aria-labelledby="tracks-heading" className="flex flex-col gap-2.5">
      <h2 id="tracks-heading" className={`${heading} px-1`}>
        Tracks
      </h2>
      {details.tracks.map((track) => (
        <article
          key={track.name}
          aria-label={track.name}
          className="flex flex-col gap-2 rounded-[20px] bg-bg px-[18px] py-4 shadow-[0_1px_3px_rgba(22,22,26,0.06)]"
        >
          <h3 className="font-bold">{track.name}</h3>
          {track.description ? (
            <p className="text-sm leading-normal text-zinc-700 dark:text-zinc-300">
              {track.description}
            </p>
          ) : null}
          {track.skills.length ? (
            <ul aria-label="Skills that help" className="flex flex-wrap gap-1.5">
              {track.skills.map((slug) => (
                <li
                  key={slug}
                  className="inline-flex h-7 items-center rounded-full bg-accent-soft px-2.5 text-[13px] font-semibold text-accent-soft-ink"
                >
                  {displayLabel(slug)}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
      {details.tools ? (
        <p className="px-1 text-[13px] text-muted">Tools you get: {details.tools}</p>
      ) : null}
    </section>
  );
}

/** Prizes: the total, then each prize. */
export function EventPrizes({ details }: { details: EventDetails }) {
  if (!details.prizes.length && details.prizeTotalCents === null) return null;
  return (
    <section aria-labelledby="prizes-heading" className={card}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="prizes-heading" className={heading}>
          Prizes
        </h2>
        {details.prizeTotalCents !== null ? (
          <span className="text-xl font-extrabold tracking-[-0.01em]">
            {formatDollars(details.prizeTotalCents)} total
          </span>
        ) : null}
      </div>
      {details.prizes.length ? (
        <ul className="flex flex-col gap-2">
          {details.prizes.map((prize, index) => (
            <li
              key={`${prize.label}-${index}`}
              className="flex items-start justify-between gap-3 text-[15px]"
            >
              <span className="flex items-start gap-2">
                {index === 0 ? (
                  <Trophy aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-700" />
                ) : (
                  <span aria-hidden="true" className="w-4 shrink-0" />
                )}
                <span className="flex flex-col">
                  {prize.label}
                  {prize.note ? <span className="text-[13px] text-muted">{prize.note}</span> : null}
                </span>
              </span>
              {prize.amountCents !== null ? (
                <span className="font-bold">{formatDollars(prize.amountCents)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** How it's judged. */
export function EventJudging({ details }: { details: EventDetails }) {
  if (!details.judging.length) return null;
  return (
    <section aria-labelledby="judging-heading" className={card}>
      <h2 id="judging-heading" className={heading}>
        How it&apos;s judged
      </h2>
      <ul className="flex flex-col gap-2">
        {details.judging.map((item) => (
          <li key={item.criterion} className="flex justify-between gap-3 text-[15px]">
            <span>{item.criterion}</span>
            {item.weightPct !== null ? <span className="font-bold">{item.weightPct}%</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function dayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The schedule, grouped by day. */
export function EventSchedule({ details }: { details: EventDetails }) {
  if (!details.schedule.length) return null;
  const days: { date: string | null; items: EventDetails["schedule"] }[] = [];
  for (const item of details.schedule) {
    const last = days.at(-1);
    if (last && last.date === item.date) last.items.push(item);
    else days.push({ date: item.date, items: [item] });
  }
  return (
    <section aria-labelledby="schedule-heading" className={card}>
      <h2 id="schedule-heading" className={heading}>
        Schedule
      </h2>
      {days.map((day, index) => (
        <div
          key={`${day.date}-${index}`}
          className={`flex flex-col gap-2 ${index ? "border-t border-line pt-3" : ""}`}
        >
          {day.date ? <h3 className="text-sm font-bold">{dayLabel(day.date)}</h3> : null}
          <ol className="flex flex-col gap-1.5">
            {day.items.map((item, i) => (
              <li key={i} className="grid grid-cols-[76px_1fr] gap-2 text-sm">
                <span className="text-muted">{item.time}</span>
                <span>{item.label}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

/** What's included. */
export function EventIncluded({ details }: { details: EventDetails }) {
  if (!details.perks.length && !details.perkNotes) return null;
  return (
    <section aria-labelledby="included-heading" className={card}>
      <h2 id="included-heading" className={heading}>
        What&apos;s included
      </h2>
      {details.perks.length ? (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {details.perks.map((perk) => (
            <li key={perk} className="flex items-center gap-2 text-sm">
              <Check aria-hidden="true" className="size-4 text-green-600" strokeWidth={2.5} />
              {PERK_LABELS[perk]}
            </li>
          ))}
        </ul>
      ) : null}
      {details.perkNotes ? <p className="text-sm text-muted">{details.perkNotes}</p> : null}
    </section>
  );
}

/** Who's going on HackaMatch: the skill bars (members only, and only from 5 people). */
export function EventGoingSkills({ skills }: { skills: { skill: string; people: number }[] }) {
  if (!skills.length) return null;
  const top = Math.max(...skills.map((s) => s.people));
  return (
    <ul aria-label="Top skills of people going" className="flex flex-col gap-2">
      {skills.map(({ skill, people }) => (
        <li key={skill} className="grid grid-cols-[128px_1fr_24px] items-center gap-2.5 text-sm">
          <span className="truncate">{displayLabel(skill)}</span>
          <span aria-hidden="true" className="h-2 rounded-full bg-accent-soft">
            <span
              className="block h-2 rounded-full bg-accent"
              style={{ width: `${Math.max(8, Math.round((people / top) * 100))}%` }}
            />
          </span>
          <span className="text-right font-semibold">{people}</span>
        </li>
      ))}
    </ul>
  );
}

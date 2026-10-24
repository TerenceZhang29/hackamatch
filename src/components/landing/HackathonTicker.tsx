"use client";

import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEventDates } from "@/lib/time";

/** How long each hackathon stays up, in ms. */
const HOLD = 3000;

export interface TickerEvent {
  slug: string;
  name: string;
  start_date: string;
  end_date: string;
}

/**
 * Upcoming hackathons on the landing page (P1-24): one at a time, sliding
 * sideways every 3 seconds, with dots showing which is up. Each links to its
 * event page. Every link stays in the tab order; hover or focus pauses it,
 * and focusing a link brings it into view. A copy of the first one at the
 * end lets it loop without sliding back. Without JavaScript the first shows.
 */
export function HackathonTicker({ hackathons }: { hackathons: readonly TickerEvent[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [snap, setSnap] = useState(false);
  const count = hackathons.length;

  useEffect(() => {
    if (paused || count < 2) return;
    const timer = setInterval(() => {
      // Reduced motion has no slide, so no transitionend to reset the loop on.
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setSnap(false);
      setIndex((i) => (reduce ? (i + 1) % count : Math.min(i + 1, count)));
    }, HOLD);
    return () => clearInterval(timer);
  }, [paused, count]);

  if (count === 0) return null;
  const current = index % count;
  const slide = (event: TickerEvent, key: string, copy = false) => (
    <li
      key={key}
      className="flex w-full shrink-0 flex-col items-center justify-center gap-3 px-1"
      aria-hidden={copy || undefined}
    >
      <Link
        href={`/e/${event.slug}`}
        tabIndex={copy ? -1 : undefined}
        onFocus={() => setIndex(hackathons.indexOf(event))}
        className="text-[34px] leading-[1.1] font-extrabold tracking-[-0.03em] text-accent hover:underline sm:text-[40px]"
      >
        {event.name}
      </Link>
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[15px] font-bold text-accent-ink">
        <CalendarDays aria-hidden="true" className="size-4" />
        {formatEventDates(event.start_date, event.end_date)}
      </span>
    </li>
  );
  return (
    <div
      className="flex w-full flex-col items-center gap-2 rounded-3xl bg-accent-soft px-4 pt-3.5 pb-[18px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="w-full overflow-hidden">
        <ul
          aria-label="Upcoming hackathons"
          className={`flex h-[140px] ${snap ? "" : "transition-transform duration-500 ease-out"}`}
          style={{ transform: `translateX(-${index * 100}%)` }}
          onTransitionEnd={() => {
            if (index === count) {
              setSnap(true);
              setIndex(0);
            }
          }}
        >
          {hackathons.map((event, i) => slide(event, String(i)))}
          {count > 1 ? slide(hackathons[0]!, "loop", true) : null}
        </ul>
      </div>
      {count > 1 ? (
        <div aria-hidden="true" className="flex gap-1.5">
          {hackathons.map((event, i) => (
            <span
              key={event.slug}
              className={`h-1.5 rounded-full transition-all ${
                i === current ? "w-5 bg-accent" : "w-1.5 bg-accent/30"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { NycHackathon } from "@/lib/nyc-hackathons";
import { formatDateRange } from "@/lib/time";

/** How long each hackathon stays up, in ms. */
const HOLD = 3000;

/**
 * Upcoming hackathons, one at a time, rolling up every 3 seconds. Every link
 * stays in the list for screen readers and the tab order; hover or focus
 * pauses it, and focusing a link brings it into view. A copy of the first
 * one at the end lets the roll loop without sliding back. Without
 * JavaScript the first one shows.
 */
export function HackathonTicker({ hackathons }: { hackathons: readonly NycHackathon[] }) {
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
  const slide = (hackathon: NycHackathon, key: string, copy = false) => (
    <li key={key} className="flex h-28 flex-col justify-center" aria-hidden={copy || undefined}>
      <a
        href={hackathon.url}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={copy ? -1 : undefined}
        onFocus={() => setIndex(hackathons.indexOf(hackathon))}
        className="group flex flex-col gap-1"
      >
        <span className="line-clamp-2 text-2xl leading-tight font-bold tracking-tight group-hover:underline sm:text-4xl">
          {hackathon.name}
        </span>
        <span className="text-sm text-muted sm:text-base">
          {formatDateRange(hackathon.start, hackathon.end)} · {hackathon.place}
        </span>
      </a>
    </li>
  );
  return (
    <section
      aria-labelledby="ticker-heading"
      className="flex flex-col gap-2 border-l-4 border-accent pl-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <h2 id="ticker-heading" className="text-sm font-medium text-muted">
        Upcoming in NYC
      </h2>
      <div className="h-28 overflow-hidden">
        <ul
          className={snap ? "" : "transition-transform duration-500 ease-out"}
          style={{ transform: `translateY(-${index * 7}rem)` }}
          onTransitionEnd={() => {
            if (index === count) {
              setSnap(true);
              setIndex(0);
            }
          }}
        >
          {hackathons.map((hackathon, i) => slide(hackathon, String(i)))}
          {count > 1 ? slide(hackathons[0]!, "loop", true) : null}
        </ul>
      </div>
    </section>
  );
}

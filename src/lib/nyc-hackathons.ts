/**
 * Upcoming NYC-area hackathons for the logged-out landing page's ticker.
 * Hand-picked from public listings on 2026-10-22 (hackathonradar.com, AI
 * Tinkerers NYC, ProgramEarth, Innodata). These are not HackaMatch events;
 * refresh the list by hand as they pass.
 */

export interface NycHackathon {
  name: string;
  /** `YYYY-MM-DD`, local dates. */
  start: string;
  end: string;
  place: string;
  url: string;
}

export const NYC_HACKATHONS: readonly NycHackathon[] = [
  {
    name: "Spacefast Build and Hack Night",
    start: "2026-10-26",
    end: "2026-10-26",
    place: "SoHo",
    url: "https://lu.ma/3w2xd2z6",
  },
  {
    name: "NYC Environmental Agent-a-thon",
    start: "2026-11-07",
    end: "2026-11-07",
    place: "New York",
    url: "https://programearth.org/companies/hackathons/nyc-agent-a-thon",
  },
  {
    name: "Fashion and Finance Hackathon",
    start: "2026-11-07",
    end: "2026-11-07",
    place: "AI Tinkerers NYC",
    url: "https://nyc.aitinkerers.org/p/fashion-and-finance-hackathon-with-zoowork",
  },
  {
    name: "Innodata Hackathon 2026",
    start: "2026-11-14",
    end: "2026-11-14",
    place: "St. John's Manhattan",
    url: "https://innodata.com/events/innodata-hackathon-2026/",
  },
];

/** The hackathons that haven't ended by `today` (`YYYY-MM-DD`), soonest first. */
export function upcomingNycHackathons(
  today: string,
  list: readonly NycHackathon[] = NYC_HACKATHONS,
): NycHackathon[] {
  return list
    .filter((hackathon) => hackathon.end >= today)
    .sort((a, b) => a.start.localeCompare(b.start));
}

import { readFileSync } from "node:fs";
import { render } from "@react-email/render";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  inWindow,
  isKnown,
  mlhNextPage,
  nameKey,
  newListings,
  parseDevpost,
  parseDevpostDates,
  parseLuma,
  parseMlh,
  sameName,
  sourceUrl,
  urlKey,
  type Listing,
} from "@/lib/event-sources";
import { EventSuggestions, eventSuggestionsSubject } from "@/lib/notify/templates/EventSuggestions";
import { MAX_DRAFTS, discoverEvents, type DiscoveryDeps } from "@/server/event-discovery";

vi.mock("@/lib/config", () => ({
  getConfig: () => ({ APP_TIMEZONE: "America/New_York", LLM_PROVIDER: "fake" }),
}));

// Saved on 2026-11-16 and trimmed to the data the parsers read.
const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/sources/${name}`, import.meta.url), "utf8");
const mlh1 = fixture("mlh-page1.html");
const mlh2 = fixture("mlh-page2.html");
const devpost = fixture("devpost.json");
const luma = fixture("luma-nyc.html");

const mlhPage = (events: unknown[], nextPage: number | null = null) =>
  `<script data-page="app" type="application/json">${JSON.stringify({
    props: { upcomingEvents: events },
    scrollProps: { upcomingEvents: { nextPage } },
  })}</script>`;

const mlhEvent = (overrides: Record<string, unknown> = {}) => ({
  name: "HackNYC",
  startsAt: "2027-02-06T14:00:00Z",
  endsAt: "2027-02-07T22:00:00Z",
  url: "/events/hacknyc/prizes",
  websiteUrl: "https://hacknyc.example.org/",
  location: "New York, New York",
  formatType: "physical",
  venueAddress: { city: "New York", state: "New York", country: "US" },
  customFields: { underserved_types: [] },
  ...overrides,
});

describe("MLH", () => {
  it("reads the season page's event data, keeping in-person events near New York", () => {
    // The first page (Nov to Feb) has none near New York.
    expect(parseMlh(mlh1)).toEqual([]);
    expect(mlhNextPage(mlh1)).toBe(2);
    expect(parseMlh(mlh2)).toEqual([
      {
        source: "mlh",
        name: "HackHERS",
        startDate: "2027-02-27",
        endDate: "2027-02-28",
        url: "https://ruhackhers.org/",
        venue: "New Brunswick, New Jersey",
        format: "in_person",
      },
      {
        source: "mlh",
        name: "WiCHacks",
        startDate: "2027-02-27",
        endDate: "2027-02-28",
        url: "https://wichacks.io/",
        venue: "Rochester, New York",
        format: "in_person",
      },
    ]);
    expect(mlhNextPage(mlh2)).toBeNull();
  });

  it("keeps online events from anywhere, and drops far-away and high-school-only ones", () => {
    const html = mlhPage([
      mlhEvent(),
      mlhEvent({ name: "Far", venueAddress: { state: "CA", country: "US" } }),
      mlhEvent({ name: "Toronto", venueAddress: { state: "ON", country: "CA" } }),
      mlhEvent({
        name: "Hybrid far",
        formatType: "hybrid_physical",
        venueAddress: { state: "MA", country: "US" },
      }),
      mlhEvent({ name: "Online one", formatType: "digital", venueAddress: null }),
      mlhEvent({
        name: "Teens",
        customFields: { underserved_types: ["High School Students Only"] },
      }),
      mlhEvent({ name: "No site", websiteUrl: null }),
    ]);
    const listed = parseMlh(html);
    expect(listed.map((l) => l.name)).toEqual(["HackNYC", "Online one", "No site"]);
    expect(listed[1]).toMatchObject({ format: "online", venue: "Online" });
    // Without a website, MLH's own page for it.
    expect(listed[2]!.url).toBe("https://www.mlh.com/events/hacknyc/prizes");
  });

  it("takes the dates MLH shows: the date part as written, not converted", () => {
    // HackHERS starts "2027-02-27T01:11:11Z" and MLH lists it as FEB 27 - 28.
    const [item] = parseMlh(
      mlhPage([mlhEvent({ startsAt: "2027-02-27T01:11:11Z", endsAt: "2027-02-28T23:59:59Z" })]),
    );
    expect(item).toMatchObject({ startDate: "2027-02-27", endDate: "2027-02-28" });
  });

  it("fails loudly when the page no longer has its data", () => {
    expect(() => parseMlh("<html><body>Events</body></html>")).toThrow(/no event data/);
  });

  it("reads the season that's running: seasons start in July", () => {
    expect(sourceUrl("mlh", "2026-11-16")).toBe("https://www.mlh.com/seasons/2027/events");
    expect(sourceUrl("mlh", "2027-06-30")).toBe("https://www.mlh.com/seasons/2027/events");
    expect(sourceUrl("mlh", "2027-07-01")).toBe("https://www.mlh.com/seasons/2028/events");
  });
});

describe("Devpost", () => {
  it("reads the API's New York search, with host and US-dollar prizes as hints", () => {
    expect(parseDevpost(devpost)).toEqual([
      {
        source: "devpost",
        name: "DeveloperWeek New York 2027 Hackathon",
        startDate: "2027-05-31",
        endDate: "2027-06-17",
        url: "https://developerweek-new-york-2027.devpost.com/",
        venue: "Meadowlands Exposition Center + Online",
        format: "hybrid",
        hints: { host: "DevNetwork", prizeTotal: "$12,500" },
      },
      expect.objectContaining({
        name: "RAMHACK Mini 2026",
        startDate: "2026-11-18",
        endDate: "2026-11-18",
        format: "in_person",
        hints: { host: "Fordham University", prizeTotal: "$470" },
      }),
      expect.objectContaining({ name: "NSH @RPI 2027", hints: { host: "NSBE-SHPE RPI" } }),
      // Canadian dollars aren't read as a US prize.
      expect.objectContaining({ name: "BearHacks 2027", hints: { host: "BearHacks" } }),
    ]);
  });

  it("skips invite-only hackathons and unreadable dates", () => {
    const body = JSON.stringify({
      hackathons: [
        {
          title: "Private",
          url: "https://p.devpost.com/",
          submission_period_dates: "Jan 1, 2027",
          invite_only: true,
        },
        { title: "Odd", url: "https://o.devpost.com/", submission_period_dates: "soon" },
        {
          title: "Online",
          url: "https://x.devpost.com/",
          submission_period_dates: "Jan 1, 2027",
          displayed_location: { location: "Online" },
        },
      ],
    });
    expect(parseDevpost(body)).toEqual([
      expect.objectContaining({ name: "Online", format: "online", venue: "Online" }),
    ]);
  });

  it.each([
    ["Nov 18, 2026", "2026-11-18", "2026-11-18"],
    ["Jan 30 - 31, 2027", "2027-01-30", "2027-01-31"],
    ["May 31 - Jun 17, 2027", "2027-05-31", "2027-06-17"],
    ["Dec 30, 2026 - Jan 02, 2027", "2026-12-30", "2027-01-02"],
    ["Dec 30 - Jan 2, 2027", "2026-12-30", "2027-01-02"],
    ["Sept 5 - 7, 2027", "2027-09-05", "2027-09-07"],
  ])("reads the dates %s", (value, startDate, endDate) => {
    expect(parseDevpostDates(value)).toEqual({ startDate, endDate });
  });

  it.each(["", "Upcoming", "Foo 5, 2027", "Jan 5"])("rejects %j", (value) => {
    expect(parseDevpostDates(value)).toBeNull();
  });
});

describe("Luma", () => {
  it("reads the New York page's event list, keeping only hackathons", () => {
    // That day's popular events were meetups and talks: none is a hackathon.
    expect(parseLuma(luma)).toEqual([]);
  });

  it("keeps events named as hackathons, online ones marked online", () => {
    const list = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: [
        {
          "@type": "ListItem",
          item: {
            "@type": "Event",
            name: "Agents Hackathon NYC",
            startDate: "2026-12-05T10:00:00.000-05:00",
            endDate: "2026-12-05T20:00:00.000-05:00",
            url: "https://luma.com/agents-hack",
            location: {
              "@type": "Place",
              name: "Betaworks",
              address: { addressLocality: "New York" },
            },
          },
        },
        {
          "@type": "ListItem",
          item: {
            "@type": "Event",
            name: "Hack Night",
            startDate: "2026-12-09T18:00:00.000-05:00",
            url: "https://lu.ma/hacknight",
            eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
          },
        },
        {
          "@type": "ListItem",
          item: {
            "@type": "Event",
            name: "Founders Happy Hour",
            startDate: "2026-12-05T18:00:00.000-05:00",
            url: "https://luma.com/hh",
          },
        },
        {
          "@type": "ListItem",
          item: {
            "@type": "Event",
            name: "Hackers & Painters reading group",
            startDate: "2026-12-05T18:00:00.000-05:00",
            url: "https://luma.com/hp",
          },
        },
      ],
    };
    const html = `<script type="application/ld+json">${JSON.stringify(list)}</script><script type="application/ld+json">{broken</script>`;
    expect(parseLuma(html)).toEqual([
      {
        source: "luma",
        name: "Agents Hackathon NYC",
        startDate: "2026-12-05",
        endDate: "2026-12-05",
        url: "https://luma.com/agents-hack",
        venue: "Betaworks",
        format: "in_person",
      },
      {
        source: "luma",
        name: "Hack Night",
        startDate: "2026-12-09",
        endDate: "2026-12-09",
        url: "https://lu.ma/hacknight",
        venue: "Online",
        format: "online",
      },
    ]);
  });
});

const item = (overrides: Partial<Listing> = {}): Listing => ({
  source: "mlh",
  name: "HackNYC 2027",
  startDate: "2027-02-06",
  endDate: "2027-02-07",
  url: "https://hacknyc.example.org/",
  venue: "New York",
  format: "in_person",
  ...overrides,
});

describe("which ones are new", () => {
  it("reads links the same however they're written", () => {
    expect(urlKey("https://www.HackNYC.org/2027/?utm_source=mlh#top")).toBe("hacknyc.org/2027");
    expect(urlKey("https://lu.ma/abc")).toBe(urlKey("https://luma.com/abc/"));
    expect(urlKey("https://a.org/x")).not.toBe(urlKey("https://a.org/y"));
  });

  it("compares names loosely: years, case, punctuation and the word hackathon don't count", () => {
    expect(nameKey("HackNYC 2027")).toBe("hacknyc");
    expect(sameName("HackNYC 2027", "hackNYC")).toBe(true);
    expect(sameName("Hack@Brown 2027", "Hack @ Brown")).toBe(true);
    expect(sameName("DeveloperWeek New York 2027 Hackathon", "DeveloperWeek New York")).toBe(true);
    expect(sameName("HackPrinceton Fall 2026", "HackPrinceton")).toBe(true);
    expect(sameName("Hacks", "BostonHacks")).toBe(false);
    expect(sameName("HackNYC", "HackMIT")).toBe(false);
  });

  it("knows an event by its link, or by a similar name on the same start date", () => {
    expect(
      isKnown(item(), [
        { name: "Other", startDate: "2026-01-01", url: "https://www.hacknyc.example.org" },
      ]),
    ).toBe(true);
    expect(isKnown(item(), [{ name: "HackNYC", startDate: "2027-02-06", url: null }])).toBe(true);
    // Same name, another date: next year's edition.
    expect(isKnown(item(), [{ name: "HackNYC", startDate: "2028-02-05", url: null }])).toBe(false);
  });

  it("keeps events that haven't ended and start within about 6 months", () => {
    const today = "2026-11-16";
    expect(inWindow({ startDate: "2026-11-14", endDate: "2026-11-16" }, today)).toBe(true);
    expect(inWindow({ startDate: "2026-11-14", endDate: "2026-11-15" }, today)).toBe(false);
    expect(inWindow({ startDate: "2027-05-18", endDate: "2027-05-19" }, today)).toBe(true);
    expect(inWindow({ startDate: "2027-05-31", endDate: "2027-06-17" }, today)).toBe(false);
  });

  it("drops known ones and repeats across sources, in date order", () => {
    const fresh = newListings(
      [
        item({
          name: "Later",
          startDate: "2027-03-01",
          endDate: "2027-03-02",
          url: "https://later.org",
        }),
        item(),
        item({ source: "devpost", name: "HackNYC", url: "https://hacknyc.devpost.com/" }),
        item({ name: "Known", url: "https://known.org" }),
        item({
          name: "Ended",
          startDate: "2026-11-01",
          endDate: "2026-11-02",
          url: "https://ended.org",
        }),
      ],
      [{ name: "Known event", startDate: "2020-01-01", url: "https://known.org/" }],
      "2026-11-16",
    );
    expect(fresh.map((f) => `${f.source}:${f.name}`)).toEqual(["mlh:HackNYC 2027", "mlh:Later"]);
  });
});

describe("the email to admins", () => {
  const props = {
    items: [
      { name: "HackHERS", dates: "Feb 26–27, 2027", venue: "New Brunswick, New Jersey" },
      { name: "RAMHACK Mini 2026", dates: "Nov 18, 2026", venue: null },
    ],
    reviewUrl: "https://app.test/admin/events#suggested",
    pauseUrl: "https://app.test/r/pause",
  };

  it("lists what was found and links to the review", async () => {
    const html = await render(createElement(EventSuggestions, props));
    expect(eventSuggestionsSubject(props)).toBe("2 new hackathons to review");
    expect(eventSuggestionsSubject({ items: props.items.slice(0, 1) })).toBe(
      "1 new hackathon to review",
    );
    expect(html).toContain("HackHERS");
    expect(html).toContain("New Brunswick, New Jersey");
    expect(html).toContain('href="https://app.test/admin/events#suggested"');
    expect(html).toContain("None is shown to members until you review and save it.");
  });
});

describe("a run", () => {
  const html = (body: string) =>
    new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
  const pages: Record<string, () => Response> = {
    "https://www.mlh.com/seasons/2027/events": () => html(mlh1),
    "https://www.mlh.com/seasons/2027/events?upcoming_page=2": () => html(mlh2),
    "https://luma.com/nyc": () => html(luma),
    [sourceUrl("devpost", "2026-11-16")]: () =>
      new Response(devpost, { headers: { "content-type": "application/json" } }),
    "https://ruhackhers.org/": () =>
      html(`<title>HackHERS</title><p>${"Rutgers' hackathon for women in tech. ".repeat(5)}</p>`),
    // A page that builds itself with JavaScript.
    "https://wichacks.io/": () => html(`<div id="root"></div>`),
  };
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = input.toString();
    return pages[url]?.() ?? new Response("Forbidden", { status: 403 });
  }) as typeof fetch;

  function setup(overrides: Partial<DiscoveryDeps> = {}) {
    const stored: Parameters<NonNullable<DiscoveryDeps["store"]>>[0][number][] = [];
    const tracked: unknown[] = [];
    const notified: number[] = [];
    const draft = vi.fn(async () => ({ description: "From the page", perks: ["meals"] }));
    const deps: DiscoveryDeps = {
      fetch: fakeFetch,
      resolve: async () => ["93.184.216.34"],
      now: new Date("2026-11-16T13:00:00Z"),
      draft,
      known: async () => [],
      store: async (items) => {
        stored.push(...items);
        return items.map((i, n) => ({
          ...i,
          id: `id-${n}`,
          pageRead: i.pageRead ?? false,
          foundAt: "2026-11-16T13:00:00Z",
        }));
      },
      notify: async (found) => {
        notified.push(found.length);
        return 1;
      },
      track: async (_name, props) => {
        tracked.push(props);
      },
      ...overrides,
    };
    return { deps, stored, tracked, notified, draft };
  }

  it("reads every source, drafts the readable pages, stores them and emails once", async () => {
    const { deps, stored, tracked, notified, draft } = setup();
    const result = await discoverEvents({}, deps);
    expect(result.sources).toEqual({
      mlh: { ok: true, listed: 2 },
      devpost: { ok: true, listed: 4 },
      luma: { ok: true, listed: 0 },
    });
    // DeveloperWeek starts more than 6 months out.
    expect(result.fresh.map((f) => f.name)).toEqual([
      "RAMHACK Mini 2026",
      "NSH @RPI 2027",
      "HackHERS",
      "WiCHacks",
      "BearHacks 2027",
    ]);
    expect(draft).toHaveBeenCalledTimes(1);
    expect(stored.find((s) => s.name === "HackHERS")).toMatchObject({
      pageRead: true,
      draft: { description: "From the page", perks: ["meals"] },
    });
    // Devpost's pages refuse automated reading: the API's hints instead.
    expect(stored.find((s) => s.name === "RAMHACK Mini 2026")).toMatchObject({
      draft: { host: "Fordham University", prizeTotal: "$470" },
    });
    expect(stored.find((s) => s.name === "RAMHACK Mini 2026")).not.toHaveProperty("pageRead");
    expect(stored.find((s) => s.name === "WiCHacks")!.draft).toBeNull();
    expect(stored.every((s) => !("hints" in s))).toBe(true);
    expect(notified).toEqual([5]);
    expect(result).toMatchObject({ drafted: 1, stored: 5, emailed: 1 });
    expect(tracked).toEqual([
      expect.objectContaining({ fresh: 5, drafted: 1, stored: 5, emailed: 1, calls: 1 }),
    ]);
  });

  it("carries on when a source fails, and says which", async () => {
    const { deps } = setup({
      fetch: (async (input: string | URL | Request) =>
        input.toString().includes("devpost")
          ? new Response("down", { status: 503 })
          : fakeFetch(input)) as typeof fetch,
    });
    const result = await discoverEvents({}, deps);
    expect(result.sources.devpost).toEqual({
      ok: false,
      listed: 0,
      error: "The site answered 503",
    });
    expect(result.fresh.map((f) => f.name)).toEqual(["HackHERS", "WiCHacks"]);
  });

  it("skips known ones, and sends no email when nothing is new", async () => {
    const { deps, notified, stored } = setup({
      known: async () =>
        [...parseMlh(mlh2), ...parseDevpost(devpost)].map((l) => ({
          name: l.name,
          startDate: l.startDate,
          url: l.url,
        })),
      notify: async (found) => {
        notified.push(found.length);
        return 0;
      },
    });
    const result = await discoverEvents({}, deps);
    expect(result.fresh).toEqual([]);
    expect(stored).toEqual([]);
    expect(notified).toEqual([0]);
  });

  it("makes at most MAX_DRAFTS model calls", async () => {
    const many = Array.from({ length: MAX_DRAFTS + 5 }, (_, i) =>
      mlhEvent({ name: `Hack ${i}`, websiteUrl: `https://hack${i}.example.org/` }),
    );
    const { deps, draft, stored } = setup({
      fetch: (async (input: string | URL | Request) => {
        const url = input.toString();
        if (url.startsWith("https://www.mlh.com/")) return html(mlhPage(many));
        if (url.includes(".example.org"))
          return html(`<p>${"A hackathon in New York. ".repeat(5)}</p>`);
        return new Response("", { status: 404 });
      }) as typeof fetch,
    });
    const result = await discoverEvents({}, deps);
    expect(result.fresh).toHaveLength(MAX_DRAFTS + 5);
    expect(draft).toHaveBeenCalledTimes(MAX_DRAFTS);
    expect(stored).toHaveLength(MAX_DRAFTS + 5);
    expect(stored.filter((s) => s.draft === null)).toHaveLength(5);
  });

  it("a dry run reads the sources only: no model, nothing stored, no email", async () => {
    const { deps, draft, stored, notified, tracked } = setup();
    const result = await discoverEvents({ dry: true }, deps);
    expect(result.fresh).toHaveLength(5);
    expect(draft).not.toHaveBeenCalled();
    expect(stored).toEqual([]);
    expect(notified).toEqual([]);
    expect(tracked).toEqual([]);
  });
});

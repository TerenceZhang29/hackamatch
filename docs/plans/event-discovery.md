# Plan: find new hackathons every week

Requested by the owner on 2026-11-16. Status: **built and tested locally (2026-11-16); not yet on production.** Still needed: the owner's approval for the production migration, for the push to `main` that turns on the schedule, and (optional) for one real run with Claude.

Production had one upcoming hackathon on 2026-11-16 ("Test Hackathon", Nov 21–22). The list should renew itself: a weekly job finds new hackathons and drafts them, and the admin approves each one before it shows. The app and the website already read events from the server, so approved events reach installed apps with no app update.

## Decisions (owner, 2026-11-16)
1. **Review mode.** The job only drafts. Nothing appears in the app or on the site until an admin presses Save, the same rule as "Fill from event site" (P1-25, decision 2).
2. **Sources:** MLH, Devpost and Luma. More can be added later (club or Cornell Tech pages) as a list in code, not a setting.
3. **When:** Mondays, 8 AM New York time. Vercel schedules in UTC, so `0 13 * * 1`: 8 AM in winter, 9 AM in summer.
4. **How:** Vercel Cron calling an endpoint in the app, not a scheduled Claude agent in the cloud. It's cheaper per run, and the code that writes to production is the reviewed app code.

## What the build found, and changed (2026-11-16)
- **The lists are data, so no model reads them.** MLH embeds its events as JSON in the page, Devpost has a JSON API, and Luma's pages carry schema.org data. The plan's listing call to Claude was dropped: the lists are read in code (`src/lib/event-sources.ts`), which is free, exact and tested on saved pages. Claude is used only to draft each new hackathon from its own page.
- **Sources as built:**
  - **MLH**: `mlh.com/seasons/<season>/events`, every page (`?upcoming_page=N`, at most 5). MLH is worldwide, so it keeps online events and in-person ones in New York, New Jersey or Connecticut, and drops high-school-only ones. The season follows the date (seasons start in July).
  - **Devpost**: its API, searched for "new york". The search is loose (an Ontario event showed up), so the admin dismisses strays. Devpost's event pages refuse automated readers (403), and the job doesn't get around that. Devpost suggestions arrive with the host and US-dollar prize total from the API, marked "Page not read".
  - **Luma**: `luma.com/nyc`, keeping events named as hackathons. The plan's `luma.com/nyc-tech` turned out to be one coworking space's calendar, and Luma's hackathon category builds its list with JavaScript, so neither could be used. The NYC page lists about 20 popular events, mostly not hackathons: expect few from Luma.
- **Dates** are the ones the sources show (MLH lists "2027-02-27T01:11:11Z" as Feb 27).
- **First dry run (2026-11-16)** found 5: RAMHACK Mini (Fordham, Nov 18), NSH @RPI (Jan 30–31), HackHERS (New Brunswick, Feb 27–28), WiCHacks (Rochester, Feb 27–28) and BearHacks (Ontario, Apr 23–25). DeveloperWeek New York (May 31) was past the 6-month window.

## How it works
1. **Trigger:** Vercel Cron calls `GET /api/cron/discover-events` with `Authorization: Bearer ${CRON_SECRET}`, which Vercel sends itself. Anything else gets a 401. `?dry=1` reads the sources and lists what's new without drafting, storing or emailing.
2. **Read the sources** through `fetchPublicPage` (`src/server/event-page.ts`): the SSRF guard, timeout, size cap and checked redirects of "Fill from event site". A source that fails is logged and skipped; the others carry on.
3. **Keep only new, upcoming ones:** dropped are:
   - ones already ended or starting more than 6 months (183 days) out;
   - ones already an event, or already suggested in any status, including dismissed (same link, or a similar name on the same start date: whole words, ignoring years and "hackathon");
   - repeats across sources.
4. **Draft each:** `draftEventFromText` reads the hackathon's own page and fills the event form. At most 15 model calls a run, three at a time, and none started after 200 seconds. A page that can't be read (blocked, or built with JavaScript) gets no call; the suggestion keeps what the list gave.
5. **Store for review** in `event_suggestions`, status `new`.
6. **Tell the admins:** one email to each admin when a run stores anything ("5 new hackathons to review"), linking to `/admin/events#suggested`. Logged in `notification_log` as `event_suggestions`. No email when there's nothing new.
7. **Review in `/admin/events`:** a "Suggested" section above the list, with name (linked to its page), dates, place, source, and "Page not read" when it applies.
   - **Review** fills the new-event form from the suggestion, outlining the filled fields as "Fill from event site" does. **Create event** saves it and marks the suggestion `approved`, linked to the event.
   - **Dismiss** marks it `dismissed`; later runs skip it.

   Suggestions whose event has ended drop out of the list.
8. **Logged:** each run records an `events_discovered` analytics event: counts per source, model calls and tokens, time taken.

## Data
Migration `20261117000000_event_suggestions.sql`. Server-only (no grants), like `reports`.

| Column | Notes |
|---|---|
| `id` | uuid |
| `source` | `mlh`, `devpost` or `luma` |
| `name`, `start_date`, `end_date`, `url`, `venue`, `format` | from the listing |
| `url_key` | the link without scheme, `www.`, query or trailing slash; unique, so a page is suggested once |
| `draft` | jsonb: the event form's values |
| `page_read` | whether `draft` came from the event's own page, or only from the list |
| `status` | `new`, `approved` or `dismissed` |
| `event_id` | the event made from it (set null if that event is deleted) |
| `found_at`, `reviewed_at`, `reviewed_by` | |

`notification_log`'s kind check gains `event_suggestions`.

## Files
- `vercel.json`: `"crons": [{ "path": "/api/cron/discover-events", "schedule": "0 13 * * 1" }]`.
- `src/app/api/cron/discover-events/route.ts`: checks `CRON_SECRET`, runs the job, returns counts. `maxDuration = 300`.
- `src/lib/event-sources.ts`: the source parsers and the which-are-new rules (pure).
- `src/server/event-discovery.ts`: the job. `src/server/event-suggestions.ts`: the table and the email.
- `src/lib/notify/templates/EventSuggestions.tsx`: the email.
- `src/app/admin/events/`: the Suggested section, Review (`EventForm` with a suggestion, `OutlineFields`) and Dismiss.
- `scripts/discover-events.ts`: `pnpm discover:events [--dry]` runs the job once, against the local database only. It sends no email (emails render only inside Next.js).

## Tests
- **Unit** (`tests/unit/event-discovery.test.ts`, 30 tests): each parser on saved, trimmed pages (`tests/fixtures/sources/`), MLH paging and filters, Devpost date formats, links and names compared loosely, the window, a whole run with fake network and storage (a source failing, known ones skipped, the 15-call cap, a dry run), and the email.
- **Database** (`tests/db/event-suggestions.test.ts`): server-only, one per page, the checks, the approved link, the email kind.
- **Browser** (`tests/e2e/event-discovery.spec.ts`): the route refuses a missing or wrong secret; an admin reviews a suggestion into an event; an admin dismisses one; ended ones aren't listed.
- **Local runs:** a dry run and a full run with the fake model against the live sources, and the route called with the secret (`?dry=1`).

## Cost
- **Vercel Cron:** one run a week. Cron jobs are on every Vercel plan; not yet checked against the project's own plan's limits.
- **Claude Haiku:** one call per new hackathon whose page can be read, at most 15 a run. The last real "Fill from event site" check was about $0.0015 a call, so a few cents a week at most; the first week's run would have made 1 call. Each run logs its token counts.
- **Building and testing:** local only, with the fake model: free.

## Needs the owner's approval
1. **Production migration** `20261117000000_event_suggestions.sql`: backup, dry run, apply.
2. **Push to `main`:** deploys the code and turns on the Monday schedule. The first run is the next Monday, 8 AM.
3. **Optional, a real run with Claude first** (locally, `LLM_PROVIDER=anthropic pnpm discover:events`, about 1 call this week, under a cent), to see a real draft before the schedule does it. Otherwise the first Monday run is the check.

## Open questions
1. **Near New York:** in-person MLH events count as near when they're in NY, NJ or CT, so Rochester and Troy come through. Tighten it (to a list of cities, or a distance) if dismissing them gets tedious.
2. **More sources:** Luma adds little. Candidates: Cornell Tech and NYU/Columbia club calendars, Eventbrite's NYC hackathon search.

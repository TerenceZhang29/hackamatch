# Plan: find new hackathons every week

Requested by the owner on 2026-11-16. Status: **planned; nothing is built.**

Production had one upcoming hackathon on 2026-11-16 ("Test Hackathon", Nov 21–22). The list should renew itself: a weekly job finds new hackathons and drafts them, and the admin approves each one before it shows. The app and the website already read events from the server, so approved events reach installed apps with no app update.

## Decisions (owner, 2026-11-16)
1. **Review mode.** The job only drafts. Nothing appears in the app or on the site until an admin presses Save, the same rule as "Fill from event site" (P1-25, decision 2).
2. **Sources:** to start, these three, each checked before it's relied on:
   - MLH's season list;
   - Devpost, filtered to New York;
   - Luma's NYC tech calendar.

   More can be added later (club or Cornell Tech pages) as a list in code, not a setting.
3. **When:** Mondays, 8 AM New York time. Vercel schedules in UTC, so `0 13 * * 1`: 8 AM in winter, 9 AM in summer.
4. **How:** Vercel Cron calling an endpoint in the app, not a scheduled Claude agent in the cloud. It's cheaper per run, and the code that writes to production is the reviewed app code.

## How it works
1. **Trigger:** Vercel Cron calls `GET /api/cron/discover-events` with `Authorization: Bearer ${CRON_SECRET}`, which Vercel sends itself. Anything else gets a 401.
2. **Read the sources:** each page goes through `fetchEventPageText` (`src/server/event-page.ts`), which already has the SSRF guard, timeout, size cap and checked redirects. A source that fails is logged and skipped; the others carry on.
3. **List the hackathons:** Claude Haiku (`LLM_MODEL_FAST`) reads each source's text and returns a list of `{ name, startDate, endDate, url, venue }` (a new prompt with a version, as in `docs/PROMPT_TUNING.md`). The fake provider gets a rule for it, so tests need no key.
4. **Keep only new, upcoming ones:** dropped are:
   - ones already ended or more than 6 months away;
   - ones already an event, or already suggested (same link, or same name and start date, compared loosely);
   - ones the admin dismissed before.
5. **Draft each:** for each new one, the existing `draftEventFromText` (`src/server/event-autofill.ts`) reads its own page and fills in the details. At most 15 drafts a run, to cap the model calls.
6. **Store for review:** new table `event_suggestions` (see Data), status `new`.
7. **Tell the admins:** one email to each admin when a run finds anything: "4 new hackathons to review", linking to `/admin/events`. Logged in `notification_log` as a new kind, `event_suggestions`. No email when there's nothing new.
8. **Review in `/admin/events`:** a "Suggested" section above the list. Each row has the name, dates, place, source and link:
   - **Review** opens the new-event form already filled in from the draft, with the filled fields outlined as with "Fill from event site". **Save** creates the event and marks the suggestion `approved`.
   - **Dismiss** marks it `dismissed`; later runs skip it.

   Suggestions for events that have already ended drop out of the list.
9. **Past events already disappear on their own:** every list shows only events that haven't ended, so nothing needs removing.

## Data
One migration, `<date>_event_suggestions.sql`. Server-only (no grants), like `reports`.

| Column | Notes |
|---|---|
| `id` | uuid |
| `source` | `mlh`, `devpost` or `luma` |
| `name`, `start_date`, `end_date`, `url`, `venue` | from the listing |
| `draft` | jsonb: the `EventDetails` draft from the event's page, or null if that page couldn't be read |
| `status` | `new`, `approved` or `dismissed` |
| `event_id` | the event made from it, once approved |
| `found_at`, `reviewed_at`, `reviewed_by` | |

Unique on the normalized link, so a run can't add the same one twice. Plus `notification_log`'s kind check gains `event_suggestions`.

## Files
- `vercel.json`: `"crons": [{ "path": "/api/cron/discover-events", "schedule": "0 13 * * 1" }]`.
- `src/app/api/cron/discover-events/route.ts`: checks `CRON_SECRET`, calls the job, returns counts. `maxDuration = 300`.
- `src/server/event-discovery.ts`: the job (sources, listing, dedupe, drafting, storing, the email).
- `src/lib/llm/prompts.ts`: the listing prompt; `src/lib/llm/fake.ts`: its fake.
- `src/lib/notify/templates/EventSuggestions.tsx`: the email.
- `src/app/admin/events/`: the Suggested section, Review and Dismiss.
- `scripts/discover-events.ts`: runs the job once by hand (`pnpm discover:events`), locally against the fake model, or for real with approval.

## Tests
- **Unit:** the dedupe (links, loose names, dates), the 6-month window, the listing parser with saved copies of each source page (`tests/fixtures/sources/`), the email.
- **Database:** `event_suggestions` is server-only; the unique link; approving links the event.
- **API:** the cron endpoint refuses a missing or wrong secret, and a run with the fake model and saved pages stores the right suggestions, skips known and dismissed ones, and emails the admin once.
- **Browser:** an admin reviews a suggestion into an event, and dismisses another.

## Cost
- **Vercel Cron:** included in Vercel's plans, and weekly is within every plan's limits. Not yet checked against the project's own plan.
- **Claude Haiku:** one listing call per source and one draft per new hackathon, at most about 18 calls a run. The last real check was 6 calls for about $0.009, so expect a few cents a week. Each run logs its token counts, like `event_autofilled`.
- **Building and testing:** local only, with the fake model and saved pages: free.

## Needs the owner's approval when reached
- A real run against the three sources, to check the listing prompt before it's trusted (a few cents).
- The production migration (backup, dry run, apply).
- The push to `main` that turns on the schedule.

## Open questions
1. **Can the sources be read?** Some sites block automated reading or build their lists with JavaScript, which this fetcher can't run. Each is checked on the first real run; a source that can't be read is dropped or replaced (a site's own feed or API, if it has one).
2. **How far ahead?** Proposed: 6 months.
3. **Online events?** Proposed: keep them, marked online, since students can join from anywhere.

# P1-25: more event details, filled from the event's site

Requested by the owner on 2026-11-02. Status: **built locally (2026-11-02), not deployed**; see "Built so far". The production migration, the deploy and the first real model call each need the owner's approval.

The event page should carry enough to choose between hackathons, and the same details will later drive event recommendations. Designed in the mockup canvas, page "Event details: more info" ([HackaMatch Sign-up Flow](https://claude.ai/artifact/HZn2BMBxNwiwDMg1J1j9HP), private to the owner). Its boards:
- the event page, full length;
- the same page scrolled, with the buttons floating;
- the events list with key facts on each row;
- **later:** "A strong fit for you" on the event page, and a "For you" sort on the list.

Where the mockup and this plan differ, this plan wins. The mockup's sample event, prizes and counts are made up.

## Built so far (2026-11-02, local only)
- **Migrations:**
  - `20261102000000_event_details.sql`: the detail columns, all nullable, with enums and size checks.
  - `20261102000001_event_going_stats.sql`: two server-only functions. `event_going_stats(uuid[])` gives going and still-need-a-team counts; `event_top_skills(uuid, int)` gives skill counts.
- **One schema** (`src/lib/event-details.ts`): checks every write and converts between the database, the form and the draft.
- **Admin form** (`src/app/admin/events/EventForm.tsx`): the new fields. Lists are edited one per line, e.g. `1st place | $5,000`, `Track | what to build | ML, Backend`, `Impact | 30%`, `2026-12-05 | 10:00 AM | Check-in`.
- **Fill from event site** (`AutofillPanel.tsx`, `autofillEventAction`):
  - `src/server/event-page.ts` downloads the page, with the SSRF guard, timeout, size cap and checked redirects, and turns HTML into text, keeping JSON-LD.
  - `src/server/event-autofill.ts` makes the model call and cleans the draft.
  - The prompt is `eventDetailsSystemPrompt` (`EVENT_PROMPT_VERSION` `2026-11-02.1`), and the fake provider has a keyword rule for it.
  - Filled fields are outlined. A second fill only replaces fields still holding the last draft.
  - The paste box works without a link.
  - The admin event pages get `maxDuration = 60`.
- **Token counts:** `llm.structured` takes an `onUsage` callback (Claude only), so `event_autofilled` logs `input_tokens` and `output_tokens`, plus model, source, size and prompt version.
- **Event page:** the new sections, each hidden when empty, in the decided order.
  - "I'm going!" and "Discover who's going" float above the tab bar. Once you're going, the bar keeps Discover and the "You're going!" status sits in the page.
  - "Who's going" adds "N still need a team" (members) and skill bars (members, from 5 people going).
- **Events list:** rows add format and venue, a prize chip, length, level, cost, "N going · N need a team" (need-a-team for members) and "Apply by".
- **Tests:**
  - unit: `event-details`, `event-autofill`;
  - database: `event-details`;
  - browser: `event-details.spec.ts`, covering sections, floating buttons, who's going, list facts, the admin fill with the fake model, and https checks.

**Assumed for the open questions until the owner says otherwise:**
- no field is required;
- "still need a team" counts people in the pool not on a team for the event;
- prizes are USD only.

**Differs from the table below:** the jsonb lists store the TypeScript shapes, e.g. `{label, amountCents, note}` and `{criterion, weightPct}`.

**Real check (2026-11-02, approved):** Claude Haiku 5.5 on the four NYC events' pages, 6 calls, about $0.009 in all. It's accurate enough to keep Haiku. Four errors were fixed in prompt `2026-11-02.2` and in code. Details are in `docs/PROMPT_TUNING.md`.

**Not done yet:**
- the production backup, migrations and deploy;
- filling in the four NYC events;

## Decisions (owner, 2026-11-02)
1. **The admin fills events in**, in `/admin/events`, helped by a "Fill from event site" button that uses Claude. Organizers may get the same form later.
2. **The AI drafts, a person saves.** Nothing it reads is published until the admin has checked the form and pressed Save.
3. **Model:** start with Claude Haiku 5.5 (`LLM_MODEL_FAST`, already the default in `src/lib/config.ts`). Switch to Claude Sonnet 5.5 only if a check on real event pages shows Haiku missing things.
4. **Event page order:** at a glance (with the event site and chat links), tracks, who's going, prizes, judging, schedule, what's included.
5. **"I'm going!" and "Discover who's going" float** at the bottom of the event page, above the tab bar, so they are always in reach while scrolling.
6. **Recommendations come later** and use plain tag matching, with no AI (see "Later: recommendations").

## What changes, at a glance
- **Event page (`/e/<slug>`):** new sections, each hidden when empty:
  - **At a glance:** when, where (in person, online or hybrid), teams, cost, open to, level, event site, chat, plus a highlighted "Apply by" line;
  - **Tracks**, with "Skills that help" tags and the tools provided;
  - **Who's going on HackaMatch:** count, how many still need a team, top skills;
  - **Prizes, How it's judged, Schedule, What's included.**
- **Events list (`/events`):** each row adds prize total, length, level, cost, "N going · N need a team" and the apply-by date.
- **Admin (`/admin/events/<id>`):** the new fields, and "Fill from event site".

## 1. Data
One migration, `supabase/migrations/<date>_event_details.sql`. Every new column is nullable (null means "not known", and the page hides it), so existing events keep working.

| Column | Type | Notes |
|---|---|---|
| `format` | enum `in_person` / `online` / `hybrid` | |
| `length_hours` | int | "24 hours"; a one-day event is about 8 |
| `entry_fee_cents` | int | 0 is free |
| `open_to` | text | short, e.g. "All students, any school, 18+" |
| `level` | enum `beginner` / `intermediate` / `advanced` | "Beginner friendly" for `beginner` |
| `apply_by` | date | |
| `apply_url` | text | https only |
| `admission` | enum `open` / `application` / `first_come` | |
| `capacity` | int | |
| `prize_total_cents` | int | USD |
| `prizes` | jsonb | `[{label, amount_cents?, note?}]`, in order |
| `tracks` | jsonb | `[{name, description, skills: slug[]}]`; skills from the taxonomy only |
| `tools` | text | "Tools you get" line |
| `judging` | jsonb | `[{criterion, weight_pct?}]` |
| `schedule` | jsonb | `[{date, time, label}]` |
| `perks` | text[] | from a fixed list: meals, mentors, sleep, travel, workshops, swag |
| `perk_notes` | text | e.g. "Travel up to $100. Bring a laptop and a student ID." |
| `chat_url` | text | Discord or similar, https only |
| `details_updated_at` | timestamptz | shown as "updated <date>" |

- **One schema for both writers:** a zod schema in `src/lib/event-details.ts` checks every write, whether from the admin form or from the AI draft. It covers sizes (at most 8 tracks, 12 prizes, 30 schedule rows), URL checks, and dropping skill slugs that aren't in the taxonomy.
- **`skills` on a track uses the same slugs as profiles** (`slugsOf("skills")` and `slugsOf("stack")`). Matching later is then a set comparison.
- **Reads:** `DETAIL_COLUMNS` in `src/server/events.ts` gains the new columns. RLS stays as it is: events stay public and only admins write (`saveEvent` in `src/server/admin.ts`). Production gets a backup first, as the runbook says.

## 2. Event page and list
- **Layout:** per the mockup, in `src/app/(app)/e/[slug]/page.tsx`, split into small components (`EventGlance`, `EventTracks`, `EventGoing`, `EventPrizes`, …) so the list rows and the later fit panel can reuse pieces.
- **Floating buttons:** a `sticky bottom-16` bar on phones (above the tab bar), `bottom-0` on wider screens, over a fade, the same pattern as Discover's `AnswerBar`. "Apply on the event site" stays in the page.
- **Who's going:** one server query over the event's pool returns:
  - the going count;
  - how many aren't on a team for the event yet;
  - the top 4 skills, as counts.

  Members only, like the faces today. The skill bars are hidden under 5 people going, so they can't single anyone out.
- **Events list rows:** only the facts that are set; a row with none looks like today's.

## 3. "Fill from event site" (admin)
1. **Input:** the admin pastes the event URL (or keeps the saved `url`) and presses **Fill from event site**. A **Paste the page's text** box is the fallback for sites that load their content with JavaScript.
2. **Fetch (server, free):** `src/server/event-autofill.ts` downloads the page:
   - https only;
   - blocks private and local addresses (SSRF guard) and checks again after each redirect, at most 3 redirects;
   - 10-second timeout, 2 MB limit.
3. **Strip to text:** drop scripts, styles and navigation, but keep `application/ld+json` event data, which many sites include. Cap at about 60,000 tokens.
4. **Ask the model:** one call through the existing client (`src/lib/llm/client.ts`, the same structured-output path as profile extraction), with a versioned prompt in `src/lib/llm/prompts.ts`. The prompt says:
   - use only what the page says;
   - leave unknown fields empty and never guess;
   - pick track skills only from the given list.

   The output goes through the zod schema in section 1, then the post-processing below.
5. **Post-process:** map skills and areas to the taxonomy (unknown ones dropped), and keep URLs only if they're https.
6. **Review:** the form fills in, with every AI-filled field marked "From the event site, check this", and nothing is saved. The admin edits and saves as usual. A second fill overwrites only the fields the admin hasn't changed since the last one.

**Guards and logging:**
- **Admins only** (`requireAdmin`).
- **Rate limit:** 30 fills an hour per admin (`LIMITS`), so a stuck button can't run up a bill.
- **Analytics:** an `event_autofilled` event with model, input and output tokens, and ok or failed.
- **The fake provider** (`src/lib/llm/fake.ts`) handles the new tool name, so tests and local runs never call the API.

## 4. Cost
Building and testing uses the fake provider and costs nothing. **The first real call needs the owner's approval** (global cost rule), as does any switch to a costlier model.

Estimate per event, assuming about 50,000 tokens of page text read and 5,000 written (list prices as of 2026-10):

| Model | Per fill | 30 fills a month |
|---|---|---|
| Claude Haiku 5.5 ($0.10 / $0.50 per million tokens) | under $0.01 | about $0.25 |
| Claude Sonnet 5.5 ($2 / $10) | about $0.15 | about $4.50 |
| Claude Opus 5.5 ($4 / $20) | about $0.30 | about $9 |

- **Every fill is charged:** a re-fill costs the same again.
- **Typical pages are smaller:** most event pages are well under 50,000 tokens.
- **Measured, not guessed:** the `event_autofilled` analytics record real token counts, so the estimate can be checked after the first fills.

## 5. Later: recommendations (not in this plan's build)
- **Fit:** for a member and an upcoming event, without AI:
  - shared areas (profile domains vs. event domains);
  - shared skills (profile skills and stack vs. the union of track skills);
  - a level match;
  - how many people going have skills the member lacks.
- **Reasons, not a score:** the event page shows the matches as plain sentences ("Health is one of your areas", "The Less paperwork track wants ML and Backend, both your skills"). The list gets a **For you** sort next to **Soonest**, with a one-line reason per row and "Top pick" on the best one.
- **A plan of its own:** fit scoring becomes its own plan once enough events carry tracks.

## 6. Tests
- **Unit:**
  - the event-details schema: limits, unknown skills dropped, URL checks;
  - the HTML-to-text step: JSON-LD kept, scripts dropped;
  - the SSRF guard: private IPs, redirects to private IPs, non-https;
  - the post-processing of a fake model reply.
- **Database:** the migration (columns nullable, enums), event reads returning the new fields, admins only writing them, and the who's-going numbers (team and not-on-a-team counts, the under-5 rule).
- **Browser:**
  - the event page shows only filled sections;
  - the floating buttons stay in view while scrolling on a phone;
  - list rows show their facts;
  - the admin's "Fill from event site" fills the form from a local test page (fake provider), leaves unknowns empty, and saves only on Save;
  - the paste fallback works.

## 7. Order of work
1. Migration, schema and admin form fields (manual entry works first).
2. Event page sections and floating buttons; events list rows.
3. Who's going numbers.
4. Fill from event site with the fake provider, then **one approved real check** on 3 to 5 real event pages with Haiku 5.5. Compare its output with the pages, and switch the model only if it falls short.
5. Production: back up, migrate, deploy; the owner fills in the four NYC events.

## Open questions
1. Which fields should the admin form require before an event is published, if any (for example format and level)?
2. Should "N still need a team" count everyone going, or only people still in the pool?
3. Prizes in other currencies: USD only for now?

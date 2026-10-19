# Plan: browse upcoming hackathons and see who is looking for a team

Requested by the owner on 2026-10-18. Status: **steps 1–3 built** (steps 1–2 on 2026-10-18, step 3 on 2026-10-19). Filters (step 4) and past events (step 5) are not started.

## The ask
Any user can see every upcoming hackathon, pick one, and see who intends to go and is looking for partners. From there they can ask for a match.

## What exists today
- **`/e/<slug>`** (`src/app/e/[slug]/page.tsx`) is the event page organizers share. It shows:
  - the dates, team size, description and a link to the event site;
  - "N people are looking for teammates" (`countEventInterest`);
  - an "I'm interested in this event" / "I'm not going after all" toggle (`event_interests`);
  - up to 6 **ideas** tagged with the event and up to 6 **builders** who tagged it, each with the usual Interested buttons;
  - "See everyone on the board" (`/?event=<slug>`) when there are more.
- The board already filters by event (`?event=<slug>`), and onboarding lets people tag upcoming events.
- Asking for a match already works from any card: Interested → Interested back → contact details revealed → "We teamed up". Teams record the event (`teams.event_id`).

## What's missing
1. **No list of events.** The only way into an event page is a shared link or the board's event filter. There is no `/events` page and no "Events" link in the header.
2. **The event page leaves people out.** "Builders going" uses `p_role: "builder"`, so someone with only an idea who tagged the event but didn't tag the idea itself doesn't appear. Each list also stops at 6.
3. **"Going" and "looking" are the same thing.** Someone who already teamed up for the event still shows as looking.

## Proposed change

### 1. `/events`: all upcoming hackathons (new page)
- Public, like the board. Upcoming events only (`listUpcomingEvents`, end date today or later in `APP_TIMEZONE`), soonest first.
- One card per event:
  - the name, dates and team size;
  - "N looking for a team";
  - "You're going" when the viewer has tagged it;
  - the whole card links to `/e/<slug>`.
- Empty state: "No upcoming hackathons yet."
- **Past events are hidden** (decided 2026-10-18). Their `/e/<slug>` pages keep working and say "This event has ended". Follow-up: a collapsed "Past events" section with summary numbers (people looking, teams formed) once 2–3 events have finished.
- An **"Events"** link in the board header for every viewer, signed in or not. The event page gets "← All events".
- Counts: one `countEventInterest` per event. That's fine while there are a few events. Swap in a grouped SQL function if the list grows past about 20.

### 2. `/e/<slug>`: everyone who is going
- **"People going"** replaces "Builders going". It shows everyone who tagged the event, whatever their role (`p_role` null). Each card shows the person's role, so idea people show up too.
- Ideas tagged with the event stay as their own section.
- **Show more** instead of stopping at 6, the same `shown` pattern the board uses (`?shown=`, adding 12 each time).
- Optional filters: role (idea / builder) and skill, reusing the board's filter code. Only add these if a pilot event gets more than about 20 people.
- The Interested buttons stay as they are, so asking for a match doesn't change.

### 3. A matching pool per event (decided 2026-10-18)
Each event has its own pool, and tagging the event joins it. The owner decided the details:

- **What counts as a match for an event:** a mutual match (both said Interested) where **both people marked that event** on the pair page ("I'd do this"). A match where only one person marked it doesn't count.
- **Seeing your matches:** on the event page, a member in the pool sees "You've matched with N people for <event>", with links to those pair pages.
- **The prompt after each new match:** each time the event gains a new match for you, you're asked once: **"Keep matching for <event>?"**
  - **Keep looking:** you stay in the pool, and the prompt waits for your next match.
  - **I have my team:** you leave the pool.
  - The prompt shows on the event page and on the pair page as soon as both of you have marked the event.
- **Leaving the pool** ("I'm going, but I have my team"):
  - You still count as going, which keeps organizer stats right.
  - You disappear from that event's page, from its "N looking" count, and from the board's filter for that event.
  - You stay on the main board and in every other event's pool, because a person can look for partners for several events at once.
  - Existing matches and contact details aren't touched.
- **Rejoining:** "I'm looking again" on the event page, at any time, until the event ends.
- **"I'm no longer going"** removes the event tag entirely. It is a separate choice from leaving the pool.
  - **With no match for the event,** it works in one tap, as today.
  - **With a match,** the main choices are "I have my team" / "I'm looking again", and "I'm no longer going" is a smaller link behind a confirmation: "You've matched with <first names> for this event. Let them know you're not going."
  - Confirming removes the tag, so you leave the pool and the "going" count. The matches, pair pages and contact details stay as they are.

**Data:** two new columns on `event_interests`, so there's no new table:
- `left_pool_at timestamptz null`: set when you leave the pool, cleared when you rejoin;
- `prompted_matches int default 0`: how many matches for the event you've already been asked about, so the prompt appears once per new match.

The pool check (`left_pool_at is null`) goes into `public_board_people`, `public_board_ideas` (an idea's author who left) and `countEventInterest`. All of this is one migration (`20261019000000_event_pools.sql`), so production needs `supabase db push`, which needs the owner's approval.

**As built (2026-10-19):**
- Matches for an event are counted in `listEventMatches` (`src/server/events.ts`) rather than a new SQL function. It's a few small queries through the service client, so there's nothing new to grant or revoke.
- Every choice goes through one server action, `eventPoolAction` (`src/app/actions/event-pool.ts`), used by both the event page and the pair page. The UI is in `src/components/EventPool.tsx`. The confirmation is a `?confirm=not-going` page state, so it works without JavaScript.
- The prompt only appears for people who tagged the event. Picking an event on a pair page doesn't tag it, so someone who never said they're going isn't asked about leaving its pool.
- Untagging an event on `/me` while you have matches for it is refused, with a pointer to the event page, so the confirmation can't be skipped.
- Re-tagging after "I'm no longer going" starts fresh (`prompted_matches` 0), so you're asked once about your existing matches.

**Dropping out after a match** (decided 2026-10-18): allowed, behind the confirmation above. There is no un-match.

## Privacy and visitors (decided 2026-10-18)
- **`/events` is public.** Anyone can see the upcoming events, the dates and the "N looking for a team" counts.
- **Signed-out visitors see at most 3 people cards and 3 idea cards per event**, each followed by a sign-in prompt: "Sign in with your Cornell email to see all N people going" (or "…all ideas for this event"; ideas have no count). Signed-in users who haven't finished onboarding get "Finish joining to see all …".
  - This applies on `/e/<slug>` and on the board's event filter (`/?event=<slug>`).
  - The "See everyone on the board" link becomes that sign-in prompt for visitors.
  - Signed-in members (onboarded) see everyone, with Show more.
  - `/people/<id>` stays public: it shows one card, reachable only by its link.
- **The limit is enforced on the server, not just hidden in the page.** The board functions (`public_board_ideas`, `public_board_people`, `public_person`) are granted to `anon` and `authenticated`. That lets anyone holding the public Supabase key call them directly and get the whole list. The app only calls them through the service client (`src/server/board.ts`), so `20261018000000_board_fns_server_only.sql` revokes `execute` on them (and on `public_idea`) from `anon` and `authenticated`, and the server applies the 3-card limit.
- **Unchanged:** cards show "First L.", role, summary and tags only. Email, NetID, full name, GitHub/LinkedIn and contact details are revealed only after both people say Interested.

## Cost
$0. No new paid calls. Pages and queries only. Step 2 adds one migration (revoking direct access), and step 3 adds another.

## Tests
- **Unit:** the `shown` parsing for the event page.
- **Database (step 3):**
  - a person who left an event's pool drops out of that event's people list, idea list and count, but stays in other events and on the main board;
  - rejoining brings them back;
  - `event_matches` counts only matches where both people marked the event.
- **E2E (step 3):**
  - two members match and both mark the event, and the "Keep matching?" prompt appears;
  - "I have my team" hides them from the event page;
  - "I'm looking again" brings them back;
  - once they have a match, "I'm no longer going" asks for confirmation and keeps the match.
- **E2E:**
  - `/events` lists upcoming events and hides past ones, and its cards link to the event page;
  - the header has an Events link;
  - an idea-only person who tagged the event appears under "People going";
  - "Show more" loads more people;
  - Interested from the event page returns to the event page;
  - a signed-out visitor sees 3 people cards, 3 idea cards and the sign-in messages on `/e/<slug>` and `/?event=<slug>`, and a member sees everyone.
- **Database:** `anon` and `authenticated` can no longer call the board functions directly (permission denied).
- **a11y:** add `/events` to `tests/e2e/a11y.spec.ts`.
- **Seed:** `supabase/seed.sql` already has upcoming events (Cornell Tech Fall Hack, Health AI Buildathon). Add one past event so the "hide past events" case can be tried locally.

## Order of work
1. `/events`, the header link and "← All events". No migration.
2. "People going" with all roles, plus Show more.
3. The per-event pool: match count, the prompt, leave / rejoin, and "no longer going" with a confirmation once matched (migration).
4. Optional: filters.
5. Later: a "Past events" section on `/events`, once 2–3 events have finished.

## Open decisions
1. ~~Step 3~~: decided, see "A matching pool per event".
2. ~~Past events~~: decided, hidden for now, with a "Past events" section as a later follow-up.
3. ~~Visitors~~: decided, `/events` is public; visitors see up to 3 people cards and 3 idea cards per event, then a sign-in prompt (see "Privacy and visitors").

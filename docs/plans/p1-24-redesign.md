# P1-24: redesign of the landing page, sign-up, cards and events

Requested by the owner on 2026-10-22. Status: **in progress (2026-10-23), on branch `p1-24-redesign`**, see "Built so far" below; the owner answered every open question on 2026-10-22 and reviewed the remaining screens on the canvas on 2026-10-23 (see Decisions). Checked against the canvas on 2026-10-23: no differences left.

The design was worked out in a clickable mockup, reviewed through about 40 comments on it: [HackaMatch Sign-up Flow](https://claude.ai/artifact/HZn2BMBxNwiwDMg1J1j9HP) (private to the owner). Its four rows:
- **Landing:** the signed-out page.
- **Sign-up flow:** the four steps.
- **Cards:** the person card, and the same card when the viewer shares a hackathon.
- **Events:**
  - the Events list, which in Play opens an event's details and then the filtered Discover;
  - an Event details screen;
  - the same screen once the viewer is going.

Where the mockup and this plan differ, this plan wins. The mockup's Discover | Events switch in the top bar and its sample counts are only sketches.

## What changes, at a glance
- **Landing (signed out):** a new headline, the upcoming hackathons rolling sideways inside a soft panel, and a "Match Now" button.
- **Sign-up:** four short steps in a new order: hackathons, areas, skills, then name and email. **The email comes last**, so the answers are saved before the sign-in link is sent.
- **Person card:** name, Going to, Interest areas, Top skills, and icon-only Pass and Interested buttons. A hackathon the viewer shares is highlighted and listed first.
- **One kind of card:** HackaMatch matches people. Ideas leave the app (owner, 2026-10-22), so there's one deck of person cards.
- **Discover:** a row of hackathon chips filters the deck.
- **Events:** "You're going" and "More hackathons" sections. Tapping a hackathon opens its details (area tags, time, place, host, description, how many are going), with "Discover who's going" opening Discover filtered on it.

## 1. Landing page (signed out, `/`)
Today: `src/components/landing/Landing.tsx` and `HackathonTicker.tsx` (vertical roll, "Join with your Cornell email").

From top to bottom:
1. **Headline:** "Find your **Hackathon Partner** for", with "Hackathon Partner" in the accent color.
2. **Rolling hackathons**, which finish the sentence:
   - They sit on an `accent-soft` rounded panel.
   - Each slide is the hackathon name, large and in the accent color, with a solid accent date pill below ("Sat, Nov 7", with a calendar icon). There is no venue.
   - One at a time, sliding **sideways** every 3 seconds, looping. Progress dots below show which one is up.
   - It pauses on hover and focus, and with reduced motion it stops sliding.
3. **"Match Now":** a full-width primary button with an arrow. It starts sign-up.

Changes to make:
- `HackathonTicker` slides horizontally and gets the dots; the date becomes a pill; the place is dropped.
- The hackathon list is **the next 5 upcoming events** from the events table (`listUpcomingEvents`, soonest first), instead of the hand-kept `src/lib/nyc-hackathons.ts`. New events show up without a code change. The four NYC events are added as events (an admin task, no migration). `nyc-hackathons.ts` and its unit test are then removed.
- "Match Now" goes to `/signup` (below), not `/join → /login`.

## 2. Sign-up: four steps, email last
Today: `/login` asks for the Cornell email first. Then `/onboarding` asks for the role, intents and name, then a sentence that the AI turns into tags, then a review step.

**New route `/signup`**, in the `(focus)` group, with a "Step N of 4" progress bar and Back on steps 2 to 4:

### Step 1: Pick your hackathon ("You can always edit this later")
- The upcoming events as rows with checkboxes. More than one can be picked.
- **"Something else?"**: a search box ("Search by name") over every supported upcoming event. Typing filters a dropdown; picking one adds it as a ticked row. With no match it says "No results", and **nothing can be typed in as a new event**.
- An **"or"** divider, then **"Undecided yet"** as a quieter row with a question-mark icon. It clears the picks, and picking an event clears it.

### Step 2: Getting to your visions ("So your matches come faster")
- "Which area(s) do you hack?": 12 popular areas as chips from the `domains` taxonomy, **up to 5** in total, with a "2 of 5" counter. The other chips are disabled at 5.
- **"Something special? Search all areas"** (owner, 2026-10-22; replaces the free-text sentence, so no AI is needed):
  - a search box over all 42 areas;
  - under the box, clickable chips: the areas whose name matches what's typed, then the areas **related** to them, marked "· related";
  - with nothing typed, it shows areas related to the ones already picked ("Related to your picks");
  - picking one adds it to the chips above and counts toward the 5;
  - "No results" when nothing matches, and nothing can be typed in as a new area.
- **New: `RELATED_DOMAINS`** in `src/lib/taxonomy/skills.ts`, a hand-written map from each area to 2 to 4 related areas (for example climate → energy, agriculture, transportation). It's checked by a unit test: every area has an entry, and every entry names a real area. The mockup's map is the starting point.

### Step 3: Now your specialty
- "Pick your top skills": **1 to 3** (at least one is required; Continue is disabled until then) across two labelled groups, **Technical** and **Business**. Design, product and research count as Business.
- "Or type it in": a search over every supported skill (the `skills` and `stack` taxonomy) with the same dropdown behavior as step 1. "No results" when nothing matches; "You have 3 skills. Remove one to add another." when full.
- **New:** a `group` per skill slug in `src/lib/taxonomy/skills.ts` (technical or business), so the split isn't hard-coded in the page.

### Step 4: Lastly, a little about you
- First name (required), Last name (optional, with "Only your initial is shown to others, like Maya P."), and Email (required, `netid@cornell.edu`, with "We'll email you a link to finish joining.").
- The button is "Join HackaMatch". It sends the magic link and shows "Check your inbox".

### Holding the answers until the email is confirmed
The account can't exist before the email is verified, but the answers must survive the trip to the inbox, **including on another device** (the reason for P1-03's token-hash link).

**Proposed:** a server-side **pending sign-up**.
- **New table `pending_signups`:** `email` (unique, lowercased), `answers` (jsonb: events, undecided, domains, skills, first and last name), `created_at`, `expires_at` (48 hours). RLS is on with no policies, so it's server-only, like `rate_limits`.
- **Step 4** validates everything (zod, as the onboarding schemas do now), upserts the row and sends the magic link with `next=/signup/finish`. The existing login rate limits apply.
- **`/signup/finish`** (after `/auth/confirm`) shows a one-screen summary ("Here's what you told us") with **Join**. Join creates the profile and the event interests, sets `onboarded_at`, deletes the row and goes to Discover.
  - The summary is never applied silently, because anyone can type someone else's email at step 4.
  - It only applies to an account that hasn't finished onboarding.
- **An expired or missing row** sends them to step 1 with their email already known.
- **Not proposed:** keeping the answers only in the browser. A link opened on a phone would lose them.

### What happens to today's onboarding
- `/onboarding` stays only for **signed-in people who haven't finished** (accounts made before this ships). It becomes the same four steps without the email step.
- `/login` stays for **returning members**: "Sign in" in the top bar, Cornell email, magic link.
- **Gone from sign-up:**
  - the role choice (P1-22);
  - the goals question;
  - the AI sentence step and its tag review;
  - GitHub and LinkedIn import, which stays on `/me` only.
- **No AI call at sign-up.** The picks are the profile, and the embedding is built from the areas and skills (`profileEmbeddingText`), plus the GitHub summary if added later on `/me`. This removes the Claude extraction call per sign-up; the Voyage embedding stays.

### Removing roles and goals (owner, 2026-10-22)
There are **no roles**: everyone is a person in the pool, shown on the same card. There are **no goals** (hackathon, side project, cofounder).
- **Code:**
  - `users.role` and `profiles.intents` stop being read or written.
  - Remove:
    - the role step and idea route from onboarding (P1-22);
    - role editing and goals editing on `/me`;
    - the role tags and "Looking for: Hackathon partner" text on cards (`PersonLines`);
    - the board's goal filter (`intent` in `BOARD_PARAM_KEYS` and `BoardFilters`).
  - Old `?intent=` links are ignored.
- **The deck and the board** list everyone in the pool (`listBoardPeople` with `role: null`).
- **Database:**
  - First, deploy the code that no longer uses the columns.
  - Then, in a second migration, drop the `role` check, the `intents` column and the role and intent arguments of `public_board_people` and `public_board_ideas`.
  - Two steps, so the running app never reads a missing column.

## 3. Person card
Today: `src/components/PersonCard.tsx`, `PersonLines.tsx` and the deck's `DeckCardView.tsx` (P1-23).

- **Layout:**
  - a white card on a light grey page, with a second card peeking behind it in the deck;
  - an `accent-soft` band at the top, with a larger avatar overlapping it;
  - the name centered underneath ("Maya P.").
- **Going to:** each hackathon has a calendar date tile ("NOV 11") and its name.
  - **The viewer's shared hackathons come first**, in the `success` colors with a green outline and "✓ You're going too". This replaces today's "You both" line for events.
- **Interest areas:** neutral chips (`domains`).
- **Top skills:** accent chips, at most 3.
- **Pass and Interested:** round, **icon-only** buttons below the card:
  - Pass is a white circle with an ×; Interested is a larger accent circle with the handshake.
  - Their `aria-label` and `title` stay "Pass" and "Interested", so screen readers, tooltips and the e2e tests that look for those names keep working.
- **Dropped from the card:** role tags, goals, the "Ideas: N" link and "You both" areas.
  - On the visitor board and `/people/[id]`, the card's own actions stay as today. Event pages no longer list people (section 7).
  - Idea cards are removed (section 4).

## 4. One deck: people only (owner, 2026-10-22)
There is only one kind of card, the person card, so **ideas are removed** from the product. P1-23's idea cards and two decks go away.
- **Discover** is one deck of person cards. Remove:
  - the Ideas | Builders toggle (`?deck=`, `parseDeckKind`, `defaultDeckKind`);
  - idea cards in the deck (`DeckCardView`'s idea branch, `nextDeckCards` for ideas).
- **Remove everywhere:**
  - "Post an idea" (the + in the shell) and `/ideas/new`;
  - `/ideas/[id]`, which returns 404 (old email links included);
  - the board's Ideas tab, so the visitor board is people only;
  - the ideas list on event pages and on `/people/[id]`;
  - the ideas section on `/me`;
  - the idea count on cards;
  - `/admin/ideas`, plus the idea fields on the admin users page.
- **Matching:** Interested is only on people. A `card_passes` row of kind `idea` is no longer written, and `kind` stays for old rows.
- **Existing ideas are hidden, not deleted.** No page reads them, and they're no longer embedded or listed, but the rows stay (owner's choice: nothing lost).
  - Matches that started from an idea keep working, because a match is between two people.
  - The pair page and emails stop mentioning the idea.
- **Unused code to delete:**
  - the idea extraction prompt (`extract-idea`);
  - `public_board_ideas` and `public_idea` (in the second migration);
  - idea embedding;
  - the demo ideas in the demo seed. The 12 demo ideas on production are left in place but unseen.
- **Analytics:** `idea_posted` stops being sent. It stays in the list so old rows still validate.

## 5. Discover: a hackathon filter
- **A row of chips** above the deck: "All hackathons", then the upcoming hackathons, the viewer's own first.
  - **"All hackathons" is pinned** at the left, then a thin divider. The hackathon chips after it scroll sideways and fade at the right edge (owner, 2026-10-23).
  - The selected chip is filled dark, with ✓, and moves to the front of the scrolling chips.
  - It sets `?event=<slug>`, which `nextDeckCards` already supports, replacing today's event chips.
  - The chips are links, so they work without JavaScript.
- **Navigation stays as today** (owner, 2026-10-22): Discover, Events, Matches and Me tabs, as a bottom bar on phones and inline in the top bar from `sm` up. The mockup's Discover | Events switch is only a sketch.

## 6. Events page (`/events`)
- **Two sections:** "You're going" (the viewer's events, green outline and tile) and "More hackathons" (the rest, soonest first), under a thin divider. Visitors see only the second section.
- **Rows:** a date tile, name, full dates and a chevron.
- **Tapping a row opens the event's details page**, `/e/<slug>`, for everyone (owner, 2026-10-23).

## 7. Event details page (`/e/<slug>`, redesigned)
- **Layout:** a back link to Events, then a card with:
  - a date tile and the event name ("✓ You're going" if the viewer is);
  - **area tags**: the event's topics as chips, using the same `domains` taxonomy people pick at sign-up, so events and people share one vocabulary;
  - rows for **when** (dates and time), **where** and **host**, each with an icon;
  - a short **description**.
- **Below the card:** a few avatars and "**N people going**" (`countEventInterest`), then **"Discover who's going"**.
- **The button:**
  - for members, it opens Discover filtered on the event (`/?event=<slug>`);
  - for visitors, it starts sign-up with the event already ticked on step 1.
- **"I'm going!"** (members): a green-outline button above "Discover who's going". Once pressed:
  - the card gets a green outline and date tile, with "✓ You're going" under the name;
  - the button becomes a green status box, "You're going! You're in the pool for this hackathon.", with a "Not going?" link;
  - the count reads "N people going, including you";
  - the event moves into "You're going" on `/events`.
  - It uses the existing event-interest actions; "Not going?" keeps today's confirmation when the viewer has matches for that event.
- **Kept:** the share link.
- **Removed:**
  - the ideas list (section 4);
  - the people list on this page, since the cards live in Discover now.
- **Data:** `events` already has `description`. Add these in the first migration, and to `/admin/events`:
  - `starts_at_time` / `ends_at_time` (text, optional);
  - `venue` and `host` (text, optional);
  - `domains` (text array of area slugs, checked against the taxonomy like profile tags).
  - A missing field just isn't shown.

## Decisions (owner, 2026-10-22 and 2026-10-23)
1. **Roles: none.** Everyone is simply a person in the pool. See "Removing roles and goals".
2. **No AI at sign-up.** The free-text sentence becomes a search over all areas, with related areas suggested from a hand-written map (`RELATED_DOMAINS`).
3. **Goals: dropped entirely.** Intents leave profiles, cards and the board filter.
4. **GitHub and LinkedIn import:** on the profile page (`/me`) only.
5. **Navigation:** keep all four tabs (Discover, Events, Matches, Me).
6. **Event details:** tapping a hackathon opens its details page (`/e/<slug>`) for everyone. "Discover who's going" opens the filtered Discover for members, or sign-up for visitors.
7. **Landing list:** the next 5 upcoming events.
8. **One kind of card:** person cards only, so Discover has one deck and **ideas are removed** from the app. Existing ideas are hidden, not deleted.
9. **Event details** (2026-10-23):
   - area tags, time, place, host, description and the going count;
   - "I'm going!" and a going status with "Not going?";
   - "Discover who's going".
10. **Discover filter** (2026-10-23): the chips filter the people deck; "All hackathons" is pinned and the rest scroll.
11. **At least one skill is required** at step 3 (2026-10-23), which keeps P1-21's rule now that ideas are gone. Continue stays disabled until one is picked.

## Order of work
1. **Data:**
   - the `pending_signups` migration, and the event time, venue, host and areas columns;
   - the technical/business `group` on skills and the `RELATED_DOMAINS` map;
   - the NYC events added through `/admin/events`.
2. **Roles, goals and ideas out of the code:**
   - onboarding, `/me`, cards and the board filter;
   - the deck toggle and idea cards;
   - "Post an idea", `/ideas/*` (404), the Ideas tab, and the ideas on event and person pages;
   - no migration yet.
3. **Sign-up:** `/signup` steps 1 to 4 (shared step components, so `/onboarding` reuses steps 1 to 3), the pending row, `/signup/finish`, and the rate limits.
4. **Landing:** the new layout and horizontal ticker, fed from the next 5 events; remove `nyc-hackathons.ts`.
5. **Person card and deck:** the new card and the round buttons; the hackathon chips on Discover.
6. **Events and event details:** the sections, the redesigned `/e/<slug>` and its button to the filtered Discover; the new fields in `/admin/events`.
7. **Second migration**, once step 2 is live:
   - drop `intents` and the role check;
   - drop the role and intent arguments of `public_board_people`;
   - drop `public_board_ideas` and `public_idea`.
   - The `ideas` table and its rows stay.
8. **Docs:**
   - `docs/design.md` (cards, landing, sign-up);
   - `PROGRESS.md` row P1-24;
   - notes in the P1-22 and P1-23 plans that parts are superseded.

## Approvals needed
- **The two migrations on production** (`supabase db push`), the second one only after the code that stops using roles and goals is deployed.
- **Adding the NYC events on production** (an admin write).
- **Commit and push.**
- **Cost:** none new, and less AI use (no Claude call at sign-up). No live AI or email tests without asking.

## Tests
- **Unit:**
  - the step schemas: at most 5 areas; 1 to 3 skills (none is rejected); Undecided and events are exclusive; the name rules from `nameFields`;
  - the search filter (match on any part of the name, no free text);
  - the technical/business grouping covers every skill slug;
  - `RELATED_DOMAINS` has an entry for every area, and every related area is a real one;
  - the area search returns matches first, then related areas, and nothing for an unknown word;
  - the pending-row expiry.
- **Database:**
  - `pending_signups` is server-only;
  - upsert by email replaces older answers;
  - expired rows are ignored.
- **E2E:**
  1. Landing shows the headline, one hackathon at a time with its date, and Match Now goes to step 1.
  2. The full sign-up with the fake email provider: answers are kept across the magic link; `/signup/finish` shows them; Join lands on Discover with the picked events and tags saved.
  3. **The link opened in a fresh browser context** still finds the answers.
  4. Searching a hackathon or skill that doesn't exist shows "No results" and can't be added.
  5. A 6th area and a 4th skill are disabled. Searching "space" on step 2 offers Space, then its related areas, and picking one adds it.
  6. There's no Ideas tab, toggle or "Post an idea"; `/ideas/<id>` and `/ideas/new` return 404; Discover shows only person cards.
  7. The person card shows a shared hackathon first with "You're going too", and the icon-only buttons are found by the names Pass and Interested.
  8. Events: going first, the others below. "I'm going!" on a details page shows the status box and moves the event into "You're going"; "Not going?" undoes it. A tap opens the details page with time, place, host and the going count. "Discover who's going" opens Discover with that event's chip selected, or sign-up with it ticked for a visitor.
  9. axe and no horizontal scroll on every new page, desktop and mobile; the landing works without JavaScript (first hackathon shown).
- **Existing tests updated or removed:**
  - updated: the landing, onboarding, login, deck, board, event and journey specs;
  - removed: the idea specs (`ideas.spec.ts`, the idea parts of `interest.spec.ts` and `deck.spec.ts`) and the idea database tests (`draft-ideas`, `public-idea`).

## Relation to other work
- **Supersedes P1-22:** the idea-or-builder question, the idea route and the AI sentence step at sign-up, and the role itself.
- **Supersedes most of P1-23:** idea cards, the two decks and the role-based default go. The person card is redesigned. Per-card Pass stays, for people.
- **Supersedes P1-09** (post an idea) and the idea parts of P1-10, P1-11 and P1-17.
- P1-21's rule ("no idea and no skill → blocked") is met by requiring at least one skill at step 3 (owner, 2026-10-23).

## Built so far (live on production since 2026-10-24)
- **Done, with tests:**
  - order of work steps 1 to 6 (except the `/me` imports);
  - match emails and the pair page no longer name an idea.
- **First migration:** `20261024000000_signup_and_event_details.sql`. Applied locally, and on production on 2026-10-24 (owner approved; backup taken first).
- **NYC events on production** (2026-10-24, owner approved): Spacefast Build and Hack Night, NYC Environmental Agent-a-thon, Fashion and Finance Hackathon and Innodata Hackathon 2026, with venue, host, areas and link. No time or description yet; add them in `/admin/events`.
- **Second migration:** `20261025000000_drop_goals_and_idea_fns.sql` drops `users.intents` and its type, the idea board and idea page functions, and the role check and the role and goal arguments of `public_board_people` and `public_person`. The `role` column stays. Code and tests stopped using them first, so it runs after that deploy (owner approved 2026-10-24).
- **Deviations from the plan:**
  - The event time is one free-text field, `time_label` (for example "9:00 AM – 5:00 PM"), not separate start and end times.
  - New members got `role = 'both'`, hidden, while the board functions still checked roles. The second migration removed that check, so the write in `completeSignup` can go.
  - `/me` lost its sentence section too, since no AI runs at sign-up.
  - Tests can run next to `pnpm dev`: `NEXT_DIST_DIR=.next-e2e E2E_PORT=3100 pnpm test:e2e`. Magic and email links open on the server under test.
- **Matched to the mockup (2026-10-23):** sizes, weights, spacing and colors on the landing page, all four sign-up steps, the person card and Discover (grey page, white filter strip, peeking card, round buttons), the Events list and the event page.
  - The Events rows no longer show an "N going" count, as in the mockup.
  - The event page keeps one small line the mockup doesn't have: team size and the event site link.
- **Deployed (2026-10-24, owner approved):** `main` at `4cdf007`, CI green. Both migrations are on production, each after a backup.
- **Still open (as of 2026-10-26):**
  - GitHub and LinkedIn import on `/me`. It was only ever in onboarding, so it needs building.
  - Removing now-unused code:
    - `server/ideas.ts` (only the Phase 0 import still calls `createIdea`);
    - the idea and profile extraction prompts (`lib/llm/extract-idea.ts`, `extract-profile.ts`) and `runProfileExtraction`, `getOnboardingExtraction`, `answerClarifyingQuestion`, `checkJoin`, `isExtracted`, `isOnboarded`, `setRole`, `updateSentence` in `server/profiles.ts`;
    - `lib/onboarding.ts` and the leftover schemas in `(focus)/onboarding/schema.ts` (`ROLES`, `INTENTS`, `sentenceInputSchema`, `joinPoolInputSchema`), with their unit tests;
    - the demo seed's ideas, and the `role = 'both'` write in `completeSignup`;
    - the Phase 0 import still reads roles, goals and sentences and runs AI extraction: decide whether to keep it.
  - Docs: `design.md` sections (cards, landing, sign-up), and notes in the P1-22 and P1-23 plans that parts are superseded.
  - The four NYC events have no time or description yet (`/admin/events`).
  - Local only: the extra `dev-901` account makes 2 database tests fail; resetting the local database (`pnpm db:reset`) clears it, and needs the owner's go-ahead.
  - Browser tests time out under the default worker count against the dev server; run with `--workers=3` locally (CI is fine).
- **Tests:**
  - 283 unit tests pass.
  - Browser tests: 165 of 166 pass on desktop and mobile with `--workers=3`. The one failure, a sign-in rate-limit test this change doesn't touch, passes alone. With the default worker count, a few tests time out on the dev server.
  - Database tests: 61 of 63 pass after the second migration. The 2 failures come from the extra local account (`dev-901`), not from this change.
  - CI (fresh database): all green on `4cdf007`.


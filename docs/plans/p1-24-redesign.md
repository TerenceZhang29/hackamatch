# P1-24: redesign of the landing page, sign-up, cards and events

Requested by the owner on 2026-10-22. Status: **planned**; the open questions below need the owner's answers before building.

The design was worked out in a clickable mockup, reviewed through about 30 comments on it: [HackaMatch Sign-up Flow](https://claude.ai/artifact/HZn2BMBxNwiwDMg1J1j9HP) (private to the owner). It has a landing screen, the four sign-up steps, two person cards, and an Events screen that opens a filtered Discover. Where the mockup and this plan differ, this plan wins.

## What changes, at a glance
- **Landing (signed out):** a new headline, the upcoming hackathons rolling sideways inside a soft panel, and a "Match Now" button.
- **Sign-up:** four short steps in a new order: hackathons, areas, skills, then name and email. **The email comes last**, so the answers are saved before the sign-in link is sent.
- **Person card:** name, Going to, Interest areas, Top skills, and icon-only Pass and Interested buttons. A hackathon the viewer shares is highlighted and listed first.
- **Discover:** a row of hackathon chips filters the deck.
- **Events:** "You're going" and "More hackathons" sections. Tapping a hackathon opens Discover filtered on it.

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
- The hackathon list comes from **the events table** (`listUpcomingEvents`) instead of the hand-kept `src/lib/nyc-hackathons.ts`, so new events show up without a code change. The four NYC events are added as events (an admin task, no migration). `nyc-hackathons.ts` and its unit test are then removed.
- "Match Now" goes to `/signup` (below), not `/join → /login`.

## 2. Sign-up: four steps, email last
Today: `/login` asks for the Cornell email first. Then `/onboarding` asks for the role, intents and name, then a sentence that the AI turns into tags, then a review step.

**New route `/signup`**, in the `(focus)` group, with a "Step N of 4" progress bar and Back on steps 2 to 4:

### Step 1: Pick your hackathon ("You can always edit this later")
- The upcoming events as rows with checkboxes. More than one can be picked.
- **"Something else?"**: a search box ("Search by name") over every supported upcoming event. Typing filters a dropdown; picking one adds it as a ticked row. With no match it says "No results", and **nothing can be typed in as a new event**.
- An **"or"** divider, then **"Undecided yet"** as a quieter row with a question-mark icon. It clears the picks, and picking an event clears it.

### Step 2: Getting to your visions ("So your matches come faster")
- "Which area(s) do you hack?": chips from the `domains` taxonomy, **up to 5**, with a "2 of 5" counter. The other chips are disabled at 5.
- "Something special? Tell us in a short sentence": optional, up to 140 characters.

### Step 3: Now your specialty
- "Pick your top skills": **up to 3** across two labelled groups, **Technical** and **Business**. Design, product and research count as Business.
- "Or type it in": a search over every supported skill (the `skills` and `stack` taxonomy) with the same dropdown behavior as step 1. "No results" when nothing matches; "You have 3 skills. Remove one to add another." when full.
- **New:** a `group` per skill slug in `src/lib/taxonomy/skills.ts` (technical or business), so the split isn't hard-coded in the page.

### Step 4: Lastly, a little about you
- First name (required), Last name (optional, with "Only your initial is shown to others, like Maya P."), and Email (required, `netid@cornell.edu`, with "We'll email you a link to finish joining.").
- The button is "Join HackaMatch". It sends the magic link and shows "Check your inbox".

### Holding the answers until the email is confirmed
The account can't exist before the email is verified, but the answers must survive the trip to the inbox, **including on another device** (the reason for P1-03's token-hash link).

**Proposed:** a server-side **pending sign-up**.
- **New table `pending_signups`:** `email` (unique, lowercased), `answers` (jsonb: events, undecided, domains, sentence, skills, first and last name), `created_at`, `expires_at` (48 hours). RLS is on with no policies, so it's server-only, like `rate_limits`.
- **Step 4** validates everything (zod, as the onboarding schemas do now), upserts the row and sends the magic link with `next=/signup/finish`. The existing login rate limits apply.
- **`/signup/finish`** (after `/auth/confirm`) shows a one-screen summary ("Here's what you told us") with **Join**. Join creates the profile and the event interests, sets `onboarded_at`, deletes the row and goes to Discover.
  - The summary is never applied silently, because anyone can type someone else's email at step 4.
  - It only applies to an account that hasn't finished onboarding.
- **An expired or missing row** sends them to step 1 with their email already known.
- **Not proposed:** keeping the answers only in the browser. A link opened on a phone would lose them.

### What happens to today's onboarding
- `/onboarding` stays only for **signed-in people who haven't finished** (accounts made before this ships). It becomes the same four steps without the email step.
- `/login` stays for **returning members**: "Sign in" in the top bar, Cornell email, magic link.
- **The role choice (P1-22) and the AI sentence step leave sign-up.** See the open questions.

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
- **Dropped from the card:** role tags, the "Ideas: N" link and "You both" areas.
  - On the board, event pages and `/people/[id]`, the card's own actions stay as today.
  - The idea card (P1-23) is unchanged in this ticket.

## 4. Discover: a hackathon filter
- **A row of chips** above the deck: "All hackathons", then the viewer's hackathons.
  - The selected chip is filled dark, with ✓, and moves next to "All".
  - It sets `?event=<slug>`, which `nextDeckCards` already supports, replacing today's event chips.
  - The chips are links, so they work without JavaScript.
- **The top bar** becomes a compact Discover | Events switch on phones. This replaces the bottom tab bar in the mockup; see the open questions.

## 5. Events page (`/events`)
- **Two sections:** "You're going" (the viewer's events, green outline and tile) and "More hackathons" (the rest, soonest first), under a thin divider. Visitors see only the second section.
- **Rows:** a date tile, name, full dates and a chevron.
- **Tapping a row opens Discover filtered on that event** (`/?event=<slug>`) for members. Visitors still go to the event page, `/e/<slug>`, which keeps its share link and visitor limits.

## Open questions (owner)
1. **Role and ideas.**
   - Sign-up no longer asks "idea or builder" or for an idea. Does everyone join as a **builder**, posting ideas later from "Post an idea"?
   - Today's deck default (P1-23) and the idea route (P1-22) depend on the role. Proposed: everyone joins as `builder`; posting an idea makes them `both`.
2. **The AI step.** Proposed: no AI call at sign-up at all; the picks are the profile.
   - The optional sentence is saved as written (and embedded with the picks for matching), not turned into tags.
   - This removes the extraction call and its cost at sign-up. The sentence is still checked for length, and the embedding stays (Voyage, about the same cost as today).
3. **Intents** (hackathon, side project, cofounder) aren't asked any more. Default them to `hackathon`?
4. **GitHub and LinkedIn import** isn't in the new flow. Move it to `/me` only?
5. **Navigation.** The mockup's top bar has Discover and Events only. Should Matches and Me stay as tabs (today's bottom bar on phones), or move?
6. **Events page for visitors.** Is the event page the right destination when signed out, as proposed?
7. **The landing list.** Should it show every upcoming event in the table, or only ones marked for the landing page?

## Order of work
1. **Data:**
   - the `pending_signups` migration;
   - the technical/business `group` on skills;
   - the NYC events added through `/admin/events`.
2. **Sign-up:** `/signup` steps 1 to 4 (shared step components, so `/onboarding` reuses steps 1 to 3), the pending row, `/signup/finish`, and the rate limits.
3. **Landing:** the new layout and horizontal ticker, fed from the events table; remove `nyc-hackathons.ts`.
4. **Person card and deck:** the new card and the round buttons; the hackathon chips on Discover.
5. **Events page:** the sections and the links to the filtered Discover.
6. **Docs:**
   - `docs/design.md` (cards, landing, sign-up);
   - `PROGRESS.md` row P1-24;
   - notes in the P1-22 and P1-23 plans that parts are superseded.

## Approvals needed
- **The migration on production** (`supabase db push`).
- **Adding the NYC events on production** (an admin write).
- **Commit and push.**
- **Cost:** none new, and less AI use if open question 2 is accepted. No live AI or email tests without asking.

## Tests
- **Unit:**
  - the step schemas: at most 5 areas and 3 skills; Undecided and events are exclusive; the name rules from `nameFields`;
  - the search filter (match on any part of the name, no free text);
  - the technical/business grouping covers every skill slug;
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
  5. A 6th area and a 4th skill are disabled.
  6. The person card shows a shared hackathon first with "You're going too", and the icon-only buttons are found by the names Pass and Interested.
  7. Events: going first, the others below; a tap opens Discover with that event's chip selected.
  8. axe and no horizontal scroll on every new page, desktop and mobile; the landing works without JavaScript (first hackathon shown).
- **Existing tests updated:** the landing, onboarding, login, deck and events specs.

## Relation to other work
- **Supersedes parts of P1-22:** the idea-or-builder question and the AI sentence step at sign-up.
- **Supersedes parts of P1-23:** the person card layout, and the deck's event chips.
- P1-23's two decks and per-card Pass stay.
- P1-21's rule ("no idea and no skill → blocked") is met by requiring at least one skill at step 3. Proposed: at least one skill is required.

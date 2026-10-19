# Plan: one card at a time ("the deck")

Requested by the owner on 2026-10-19. Status: **plan, decided; not built**.

## The ask
Make browsing feel easier and less overwhelming. Members see **one card at a time** and answer Interested or Pass, like a dating app, instead of scanning a list. In a later iteration, the matching score (Phase 2) decides which cards each person sees first.

## What already exists
- `answerFromBoard` (`src/server/matches.ts`) records Interested / Pass on a person or idea card, emails the other person on a first Interested, and reveals a mutual match.
- `excludedUserIds` (`src/server/board.ts`) leaves out yourself and everyone you have any match row with, including ones you passed on. So "the next card" is simply the first row the board would show.
- `DAILY_INTEREST_LIMIT` already caps Interested per day.
- So the deck needs **no database change** for the first version.

## Decisions
1. **Where it goes** (decided 2026-10-19): signed-in, onboarded members land on the deck at `/`, with a "Browse all" link to today's list (kept, for example at `/?view=list` or `/browse`). Signed-out visitors and members who haven't finished onboarding keep the current list, which shows them who's on the site and gets them to sign up.
2. **What's in the stack** (decided 2026-10-19): one stack, chosen by your role, with no switch.
   - Builders see idea cards.
   - Idea people see builder cards.
   - People who do both see the two alternating.
   - Answering an idea card also removes its owner's person card, and the other way round. `excludedUserIds` already does this.
   - A hidden "Showing: ideas ▾" switch can come later if testers ask.
3. **One event's stack** (decided 2026-10-19): chips at the top of the deck: `[Everyone] [Fall Hack] [Health AI]`.
   - The chips are only for events you're going to.
   - A chip narrows the stack to that event's pool: people still in it (not "I have my team") and ideas tagged for it. This is the board's existing `event` filter, which is already pool-aware.
   - Each event page gets a "Find teammates for this event" button that opens the deck on that event.
   - **For Phase 2's ranking:** in "Everyone", show the pool of an event you're going to soon first, then everyone else. This was option C, which the owner asked to consider for Phase 2. It's noted under the `event` feature in `docs/IMPLEMENTATION_PLAN.md` §7.
4. **Undo** (decided 2026-10-19): "↶ Undo" for your **last Pass only**.
   - It appears under the next card and goes away once you answer another card.
   - Interested can't be undone: it may already have emailed the other person or revealed a match.
   - How it works: an `undoPass(matchId)` action checks that the viewer's answer on that match is `pass` and the match isn't revealed. If the other side is still `pending`, the row exists only because of this Pass, so it's deleted. Otherwise, for example when they had said Interested first, the viewer's answer is set back to `pending`. Nobody is told about a Pass, so undoing it has no other effects.
   - **For Phase 2:** passes expiring after some time, or when the person posts a new idea, is noted next to the "no existing match" filter in `docs/IMPLEMENTATION_PLAN.md` §7.
5. **What a card shows** (decided 2026-10-19): the fuller card (option B), and a full profile you can open **without leaving the deck**.
   - **The card:**
     - **Person card:** role, "First L.", summary, what they're looking for (intents), experience level, and the events they're going to, with shared ones marked. A "You both: react · health · Fall Hack" line lists shared tags and events.
     - **Idea card:** pitch, owner "First L." and role, area, size, and skills needed, with the ones you have highlighted ("Needs: react ✓, ml, design").
     - "You both" is plain tag matching, with no AI and no cost.
   - **The full profile:** swipe up, or tap "See full profile", and the card expands in place.
     - **Person:** every tag, and their open ideas' pitches.
     - **Idea:** the owner's profile (summary and tags) and the idea's event.
     - Pass and Interested stay pinned at the bottom, and swiping left or right still works. Answering moves on to the next card, already collapsed.
     - Without JavaScript, `?more=1` opens the expanded card.
   - **Still private until a mutual match** (confirmed by the owner 2026-10-19, GitHub included): email, GitHub, LinkedIn, the full name and the full idea text. These come from `getPairPage` only, as today. The full profile uses only what `public_person` / `public_idea` / the board functions already return, plus the person's events (already shown to members on event pages) and their open ideas' pitches (already public on the board).

## Design
- **Layout:** one large card, with **Pass** and **Interested** buttons pinned at the bottom within thumb reach. A small "N left" count and the event chips sit at the top.
- **Gestures:**
  - Swipe right for Interested, left for Pass, and up for the full profile.
  - On a laptop, use → / ← and ↑.
  - Each button is a plain form post (`answerCard`, with `returnTo` set to the deck URL) that loads the next card, so it works without JavaScript. The swipe layer is a small client component that animates the card and then submits the same form.
- **A mutual match:** answering redirects with `?matched=<id>` (the existing outcome parameter). The deck then shows a "You matched with <name>!" screen, with "Say hi" (the pair page) and "Keep going" (the next card).
- **After a Pass:** the redirect carries `?passed=<matchId>`, so the deck can offer "↶ Undo" for that one match (decision 4).
- **End of the deck:** "You've seen everyone for now", with links to `/events`, "Post an idea" and `/matches`. With an event chip on, it says "You've seen everyone going to <event>", with a link back to Everyone.
- **The list stays:** "Browse all" in the header opens today's board (`/?view=list`, keeping its tabs, filters and Load more). Any board URL with list parameters (`tab`, `domain`, `skill`, `intent`, `n`) still shows the list, so shared links keep working. Visitors and members who haven't finished onboarding always get the list.

## Data
- **`nextDeckCards(viewer, eventSlug | null, limit)`** in a new `src/server/deck.ts` returns the next few cards in order.
  - It uses the existing board functions with the viewer's exclusions: `listBoardIdeas` for builders, `listBoardPeople` with `role: "idea"` for idea people, and both interleaved for "both".
  - Order for now: featured, then newest, as the board does.
  - **This is the one function Phase 2's ranking replaces.**
- **The "N left" count:** fetch up to 101 rows and show "100+" beyond that. There's no new count query.
- **"You both" and the highlighted skills:** computed in TypeScript from the viewer's profile tags and event interests against the card's tags and events. A pure function, unit tested.
- **The person's events and open ideas** for the full profile: one service-client query each, upcoming events and `status = 'open'` ideas only.
- **Undo:** `undoPass(matchId)` in `src/server/matches.ts` (see decision 4).
- **No migration.** It only reads existing data and makes one small, guarded write (undo).

## Privacy
Nothing new becomes public. The deck is for onboarded members only. Cards and the full profile use fields members can already see on the board, event pages and person pages. Contact details and the full idea text stay behind a mutual match.

## Cost
$0. No AI calls ("You both" is plain tag matching) and no new services.

## Tests
- **Unit:**
  - the "You both" / highlighted-skills function;
  - interleaving for "both";
  - which URLs show the list and which show the deck.
- **E2E:**
  - a member lands on the deck and sees one card;
  - Pass moves on, and Undo brings the card back;
  - Interested moves on, and the target gets the existing email;
  - a mutual answer shows the "You matched" screen;
  - "See full profile" expands in place and Pass / Interested still work there;
  - an event chip narrows the stack to that event's pool;
  - "Find teammates for this event" opens it;
  - the end of the deck;
  - "Browse all" opens the list;
  - visitors still get the list;
  - it works without JavaScript.
- **Swipe:** a Playwright touch-drag test on the mobile project for left, right and up.
- **a11y:** the deck and the expanded card added to `tests/e2e/a11y.spec.ts`. The buttons stay the real controls, so swiping is never the only way.

## Order of work
1. The deck at `/` for members: one card, the buttons, the end of the deck, "Browse all", and the matched screen.
2. Undo for the last Pass.
3. Fuller cards, "You both", and the full profile in place.
4. Event chips, and "Find teammates for this event" on event pages.
5. Swipe and keyboard gestures (progressive enhancement).

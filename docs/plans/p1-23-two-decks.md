# P1-23: separate idea cards and person cards, and two decks

Requested by the owner on 2026-10-21. Status: **built and tested locally (2026-10-23)**; the production migration and the push need the owner's approval.

## Context
Today there's one deck, and its contents depend on the viewer's role (`nextDeckCards` in `src/server/deck.ts`):
- builders see ideas;
- idea people see people;
- "both" see the two **interleaved**.

A person card also carries that person's idea ("Ideas: …" in `PersonLines`). For someone who both builds and has ideas, one card mixes two things, which is confusing.

**The owner's ask:**
- two kinds of card, each highlighting one thing;
- the viewer chooses which kind to swipe through.

**Decisions (owner, 2026-10-21):**
- **Pass hides only that card.** Passing Sofia's person card still shows her ideas, and the other way round. Interested on any card still makes the one match with that person.
- **The new cards are used everywhere cards appear:** the Discover deck, event pages, the visitor board, and the `/people` and `/ideas` pages.
- **The first deck shown depends on role:** builders start on Ideas, idea people on Builders, and "both" on Ideas. They can switch at any time.

## The two cards

### Idea card (`src/components/IdeaCard.tsx`, redesigned)
Highlights the idea:
1. **The idea:** the public pitch, large. This is the "description": the full text stays private until a match, as today.
2. **Owner:** avatar and name, linking to their person card.
3. **Hackathons:** the idea's own event first, then the owner's nearest upcoming events where they're still looking (`nearestPoolEvents`, up to 3), as wrapping chips.
4. **Needs:** skills needed, with ✓ on the ones the viewer has (`markNeeds`).
5. Area and scope as one muted line, plus Featured and Demo chips.

- **Expanded** (a tap on the card, as today): all needs, all hackathons, and the owner's top skills.
- There's no "Builds" or "You both" block about the owner. The idea comes first.

### Person card (`src/components/PersonCard.tsx`, redesigned; it's the builder card in the deck)
Highlights the person:
1. **Name and avatar,** with Builds/Ideas role tags.
2. **Skills:** the top 3 (`topSkills`); all of them when expanded.
3. **Hackathons:** the nearest 3 they're looking at (as the "Looking for" chips today).
4. **Ideas:** a count, "2 ideas", not the pitch. It links to their profile, where the ideas are listed. A person with no ideas shows nothing here.
5. **You both** (shared hackathons, then areas) and Area, as today.

- **Expanded:** all skills, all hackathons, and their open ideas' pitches as a list. The deck card stays about the person.
- `PersonLines` loses the "Ideas: <pitch>" line. Pitches now live only on idea cards.

## Discover: choose ideas or builders
- **A toggle at the top: Ideas | Builders.** It's a link-based segmented control (`?view=ideas` or `?view=builders`), so it works without JavaScript and can be bookmarked or shared.
- With no `view` in the link, the default comes from the viewer's role (above). Each view has its own "N left", and the event chips and Undo keep working in both.
- **`nextDeckCards(viewer, event, view)`** returns one kind only:
  - **Ideas:** open ideas (`listBoardIdeas`), from anyone, including people whose role is builder or both.
  - **Builders:** people whose role is builder or both (`listBoardPeople`, as the board's Builders tab does).
  - `interleave` is no longer used.
- **The empty state names the other view,** for example "No more ideas · Find builders", so someone can switch when a deck runs out.

## Pass per card
- **New table `card_passes`:** `user_id`, `kind` (`idea` or `person`), `target_id`, `created_at`, keyed on (`user_id`, `kind`, `target_id`). RLS is on, with no policies or grants, so it's server-only, like `rate_limits`.
- **Pass on a deck or board card** inserts a row. It no longer writes `pass` on the pair, so it doesn't hide the person's other cards. Undo deletes the row. The Undo link carries `passed=<kind>:<id>` instead of a match id, and `undoPassAction` changes to match.
- **Pass on the Matches page ("Waiting") or in an email one-click link** still answers the pair. That's declining someone who said Interested, which is a person-level answer.
- **What the decks hide:**
  - for both decks: the viewer, revealed matches, anyone the viewer said Interested to (any card), and old pair-level passes from before this change, which keep hiding as they do now;
  - for the ideas deck: also ideas in `card_passes`;
  - for the builders deck: also people in `card_passes`.
- **Database:** `public_board_ideas` and `public_board_people` get one more argument, a list of excluded idea or person ids, so the 100-card lookahead doesn't come back short. Changing a function's arguments means drop and recreate, with the server-only grants re-applied.
- **The board and event pages** hide passed cards the same way, for signed-in members.

## Everywhere else
- **Visitor board (`/`, signed out):** the Ideas | Builders tabs already exist. They switch to the new cards.
- **Event page (`/e/[slug]`):**
  - "People going" uses person cards. That list includes idea-only people, who show their idea count and no skills.
  - Ideas use idea cards.
  - The visitor limit (3 cards and a blurred row) is unchanged.
- **`/people/[id]` and `/ideas/[id]`:** the same cards at the top. Their pages keep their current details below.
- **Unchanged:** match emails, the pair page, matches rows, the admin pages and P1-22's draft ideas. Drafts are never `open`, so they never appear on idea cards.

## Built (2026-10-23): notes
- **The deck is chosen with `?deck=ideas|builders`**, not `?view=`, which the board already uses for `view=list`. A link names the deck only when the viewer picked one; otherwise the role decides.
- **`public_board_people` is unchanged.** The people deck leaves out passed people through the existing excluded-users argument. Only `public_board_ideas` changed: it gains `owner_id` and `p_exclude_idea_ids`.
- **Person and idea pages:** a Pass there also hides just that card, and the page shows "Passed". `/people/<id>` lists the person's open ideas under the card, which is where the card's "N ideas" link goes. `/ideas/<id>` keeps its own layout.
- **Analytics:** a card Pass is tracked as `passed` with `{ kind, source: "board" }` and no `match_id`.

## Order of work
1. The migration (`card_passes` and the two board functions) and the server pieces: `nextDeckCards` with `view`, the exclusions, Pass and Undo.
2. The idea card and person card components, with their expanded views, and `deckDetails` returning what each needs: the owner's events for ideas, and the idea count and pitches for people.
3. Discover: the toggle, the default, per-view counts and the empty states.
4. The board, event pages, and `/people` and `/ideas` switch to the new cards.
5. Docs: `PROGRESS.md` row P1-23, `docs/design.md` (the two cards), and a short note in `card-deck.md` that this replaces the role-based mix.

## Approvals needed
- **The migration on production** (`supabase db push`).
- **Commit and push.**
- No AI calls and no cost.

## Tests
- **Unit:** the default view by role; parsing and building `passed=<kind>:<id>`; what the idea card and person card show from sample data, as pure helpers.
- **Database:**
  - the excluded-id arguments work in both board functions;
  - `card_passes` is server-only, with no anon or member access.
- **E2E:**
  1. A "both" member opens Discover and sees Ideas; switching to Builders shows person cards only, with their own "N left".
  2. Pass on Sofia's person card; her idea still appears in Ideas. Undo brings the person card back.
  3. Interested on an idea makes the match with its owner, and both of their cards leave both decks.
  4. A person card shows the name, up to 3 skills, hackathon chips and "2 ideas", but no pitch. An idea card shows the pitch, the owner, hackathon chips and needs with ✓.
  5. Event page: people going and ideas use the new cards, and the visitor sees 3 and a blurred row.
  6. Waiting and one-click Pass still decline the person.
  7. No horizontal scroll and an axe pass on Discover in both views, on desktop and mobile.
- **Existing deck, board and event tests** are updated where the mixed deck or the "Ideas:" line changes. The full suite runs in CI mode.

## Relation to other work
- **Independent of P1-22** (sign-up routes). Either can go first. P1-22's role defaults decide which deck someone starts on.
- **Phase 2 ranking** (`IMPLEMENTATION_PLAN.md` notes) later replaces the order inside each deck. The two-deck split stays.

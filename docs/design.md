# Design system

Owner's direction (2026-10-19): cleaner and simpler, with the least text possible. A bottom tab bar on phones, neutral surfaces, and one **indigo** accent. It covers every page students see; `/admin` keeps its own plain style.

## Tokens
These are defined in `src/app/globals.css` as CSS variables, with dark values under `prefers-color-scheme: dark`, and exposed to Tailwind through `@theme inline`.

| Token | Use |
|---|---|
| `bg` | Page background |
| `surface`, `surface-2` | Cards (soft grey, no borders), and chips or hover on cards |
| `ink`, `muted` | Text, and secondary text (AA on `bg` and `surface`) |
| `line` | Hairlines and input borders |
| `accent`, `accent-ink` | The one action color (indigo-600 light, indigo-400 dark) and text on it |
| `accent-soft`, `accent-soft-ink` | Highlights: the "Keep matching?" box, Featured, the selected-tag chips, "Say hi" |
| `success-soft`, `success-ink` | "You both", skills you have, matches, "Going" |
| `danger-soft`, `danger-ink` | Errors and the "not going?" confirmation, nothing else |

- **Radius:** cards `rounded-2xl` (deck cards `rounded-3xl`), controls `rounded-xl`, chips and avatars `rounded-full`.
- **Font:** Inter through `next/font` (self-hosted, so the CSP needs nothing).
- **Icons:** `lucide-react` (pinned). Brand logos aren't in it, so GitHub and LinkedIn use Code and Briefcase.

## Components (`src/components/ui/`)
- `Button` / `buttonClass(variant, size)`: `primary` (accent), `secondary` (on the page), `outline` (on a grey card), `ghost`, `danger`; sizes `sm` / `md` / `lg`. `IconButton` is a round button; its `label` is the accessible name.
- `Chip` / `TagList`: `neutral`, `accent` or `success`; `checked` adds ✓ with ", you have this" for screen readers.
- `Avatar`: an initials circle with a stable color per name. It's decorative; the name always appears next to it.
- `Surface`, `Section` (title plus count, and labels its region), `EmptyState` (icon, one heading, at most two actions), `Notice` (one status line), and `inputClass` / `labelClass` / `FieldError` (`Field.tsx`).

## Cards (P1-23)
There are two kinds of card, one subject each. They're used on Discover, the board, event pages and `/people`:
- **Idea card** (`IdeaCard`; on Discover, `DeckCardView`):
  - the **pitch** as the title;
  - the owner (avatar and name, linking to their person card);
  - area and scope;
  - **hackathons**: the idea's event first, then the owner's nearest ones where they're still looking, as chips. These are for members only;
  - the skills it needs (✓ on Discover for the ones you have).
- **Person card** (`PersonCard` and `PersonLines`):
  - name and role tags;
  - Looking for (their hackathons);
  - Builds (top 3 skills);
  - **Ideas: N ideas**, which is a count linking to `/people/<id>#ideas`, never a pitch;
  - You both, and Area.
- Discover has an **Ideas | Builders** toggle (`?deck=`). The default depends on the role: idea people start on Builders, everyone else on Ideas. **Pass hides that one card** (`card_passes`), and Interested still answers the person.

## Shell
- **Route groups** keep the URLs unchanged.
  - `src/app/(app)` has the shell (`src/components/shell/`): a slim top bar on every page.
  - `src/app/(focus)` (sign-in, onboarding, confirm, one-click links) shows only the logo.
- **Members** get four tabs: Discover, Events, Matches, Me. They're a fixed bottom bar on phones (respecting the safe area) and inline in the top bar from `sm` up. Matches shows a count of matches waiting on you. The current tab has `aria-current="page"`, and + posts an idea.
- **Visitors** get Events and Sign in. People who haven't finished onboarding get "Finish joining".
- Detail pages (pair, event, idea, person, post an idea) have a ← icon link with a label. Other pages rely on the tabs.

## Copy rules
1. At most one short line of helper text per section. Prefer a label, a chip or an icon over a sentence.
2. Outcomes are one line (`src/components/Outcome.tsx`): "Sent", "Passed", "It's a match! Check your email.", "That's 15 today. Back tomorrow."
3. Ask questions directly ("Keep matching for Fall Hack?", "Tell Maya you're not going?"), and put two buttons under them, with no paragraph.
4. Control labels say what happens and stay stable (Pass, Interested, I'm going, I have my team, We teamed up). Tests and screen readers rely on them.
5. Privacy notes stay, as one line ("Only the pitch is public", "Public GitHub repos only. LinkedIn is never fetched.").

## Rules that keep it working
- **Everything works without JavaScript:** tabs and segmented controls are links, filters and "Your hackathons" use `<details>`, and every answer is a form post. Swipe and arrow keys are an enhancement on top (`deck/Swipe.tsx`).
- **No colour as the only signal:** selected states also use `aria-pressed` or `aria-current`, and ✓ has text.
- **Every page is scanned** by `tests/e2e/a11y.spec.ts` (axe, WCAG 2.1 AA, desktop and mobile). Don't lower opacity on text over `accent`; it fails contrast.

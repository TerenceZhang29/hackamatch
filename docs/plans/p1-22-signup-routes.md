# P1-22: two sign-up routes, idea or builder

Requested by the owner on 2026-10-21. Status: **built and tested locally (2026-10-22)**, including the live prompt test (`2026-10-22.2`, all 10 cases pass; `docs/PROMPT_TUNING.md`). The production migration and the push need the owner's approval. It replaces P1-21's "no idea means builder" rule and its unbuilt follow-up ([`p1-21-idea-or-skill.md`](./p1-21-idea-or-skill.md)).

## The owner's rules (2026-10-21)
- At sign-up, each person is first asked whether they have an idea or want to find one to build, and picks **one route**: **I have an idea** or **I want to find an idea to build** (builder).
- The page tells them the route **can be changed later in settings**, and that once they've joined they can do both.
- **Idea route:** blocked unless an idea is found in what they wrote.
- **Builder route:** blocked unless at least one skill is found or picked.
- **Slow or unavailable AI on the idea route:** they can retry. If the retry also fails, they're offered the builder route.
- **A builder who also describes an idea:** the idea is saved as a **draft** on their profile. After sign-up they're asked to check it and post it.

## What changes

### Step 1: pick a route (`src/app/(focus)/onboarding/OnboardingFlow.tsx`)
- The first question, before any sentence (owner, 2026-10-21): **"Do you have an idea, or do you want to find one to build?"** It offers two choices instead of three:
  - **I have an idea**, the idea route (role `idea`);
  - **I want to find an idea to build**, the builder route (role `builder`).
- "Both" is no longer offered at sign-up. The route is chosen on step 1 together with intents and name, and step 2's sentence prompt follows from it.
- One line under them: "You can change this later in settings. Once you've joined, you can do both."
- **Existing users keep their roles,** including `both`. The Me page still offers all three: `src/app/(app)/me/sections.tsx` is unchanged.

### Step 2: the sentence, by route
- **Idea:** "Your idea in one sentence", as today.
- **Builder:** "What you can build, in one sentence", plus the quick-pick skills (`QUICK_SKILLS` in `src/lib/onboarding.ts`). The quick picks only show on this route.

### Step 3: review and the block (`src/lib/onboarding.ts`, `src/server/profiles.ts`, `onboarding/actions.ts`)
`onboardingOutcome` is rewritten around the route. The page and `joinPool` both use it, so the page can't be bypassed.

| Route | Extraction finished | Extraction still pending, or failed |
|---|---|---|
| **Idea** | Joins only with an idea, as role `idea`. With no idea: "We couldn't find an idea in your sentence. Describe what you want to build." and Join stays off. | "Still reading your idea…" with **Check again**. If that still has no answer: "Join as a builder instead", which switches the route and keeps the sentence. |
| **Builder** | Joins only with a skill or tool from the text, a quick pick or a typed tag, as role `builder`. With none: "Add at least one skill to join." | Joins if a skill was picked or typed. Otherwise "Still reading your sentence. Pick a skill to join now, or check again." |

- **Check again** is a new server action, `onboardingStatus()`. It returns the stored extraction once it's done, in the same shape `submitSentence` gives. If the background run failed, it starts one more.
- **Going back and resubmitting** clears the earlier result, so a slow new run is "pending", never the old sentence. `saveOnboardingBasics` clears `profiles.extracted_at` and the onboarding idea or draft, for users not yet onboarded.
- **An idea still counts with a clarifying question.** The question stays optional, as today.
- **Removed from P1-21:**
  - turning an idea person into a builder (`applyNoIdeaRole`, and the role change in `joinPool`);
  - the "No idea found, so you'll join as a builder" line.
- **Kept from P1-21:** the placeholder and notes-about-the-input guards (`src/lib/llm/vague.ts`), and the role-free part of the rule that says a skill means a `skills` or `stack` tag.

### Draft ideas for builders
- **Database (one migration):**
  - add `draft` to `idea_status`;
  - drafts are left out of everything public. The board functions already list only `open` ideas. `public_idea` uses `status <> 'archived'`, so it changes to `status in ('open', 'filled')`.
  - RLS needs no change: owners read their own ideas, and others only see an idea through a match.
- **Extraction for the builder route:**
  - the model is asked for the idea too, saved with `status = 'draft'`;
  - the summary describes the person's skills only, so it doesn't reveal the draft.
  - This changes the prompt's builder rule ("idea: null unless the role is idea or both"), so it gets a new `PROMPT_VERSION` and a live test, which needs approval.
- **After joining:**
  - `/matches?welcome=1` shows one notice: "We saved your idea as a draft. Check it and post it." It links to `/ideas/<id>`.
  - The owner's idea page gets **Post it** and **Discard** for a draft. Posting sets `open`, embeds the idea and makes the person `both`, as `createIdea` already does. Discarding deletes it.
  - The Me page lists the draft with a "Draft" label.
- Drafts are never embedded, matched, emailed or counted in metrics.

## Compatibility (checked 2026-10-21)
- **No infrastructure change:** no new service, environment variable, plan or cost. It uses the same Vercel, Supabase (Postgres 17.11), Resend and Claude setup.
- **The migration is additive.** Adding an enum value is safe on Postgres 17. The `public_idea` change avoids using the new value in the same migration, by writing `status in ('open', 'filled')`. **It can't be undone simply:** Postgres can't drop an enum value. Rolling back means leaving `draft` unused.
- **Code that would break or leak without care,** all added to the work below:
  - `embedUserAndIdeas` (`src/server/profiles.ts`) embeds **every** idea of a user. It must skip drafts.
  - The admin idea count (`adminCounts`) counts every idea. It must leave drafts out, like demo ideas.
  - The Me page idea list and its status menu (`me/sections.tsx`, `me/schema.ts`), the owner's idea page, and `/admin/ideas` need a "Draft" state. The status menu must not offer `draft`, and posting goes through **Post it**.
  - Owners can update their own idea's `status` directly under RLS. A member who sets their own draft to `open` that way gets an un-embedded idea on the board, which is harmless. A trigger can block moving out of `draft` except through the server, if wanted.
  - `runProfileExtraction` also runs when a member edits their sentence on the Me page, and in the Phase 0 import. Builder drafts must be created **only during onboarding**, or every builder who edits their sentence would get a draft.
- **Already safe:**
  - every public list, the deck, `firstIdeaPitches` and match creation only use `open` ideas;
  - other members can't read an idea unless they're matched on it;
  - matching emails need an `open` idea.
- **Deploy window:** someone halfway through sign-up when the new version ships may still send `role: both` from the old page. `joinPool` accepts `both` for that window and judges it by P1-21's rule (an idea or a skill).
- **Existing users and data:** they're unchanged. `both`, demo profiles and the Phase 0 import keep working, and `createIdea`'s "builder becomes both" stays.
- **Tests:** about six e2e tests onboard as "Both" or depend on the current step 1, and change with it. The pilot gate, demo safety, email and the event-pool features aren't touched.

## Built (2026-10-22): notes
- **Picked skills while the AI is still reading** are saved without marking the tags hand-edited, and the later reading adds its tags to them. Otherwise a builder who joined early would never get their tags. A new sentence clears the old tags along with the old reading.
- **A reading for a sentence that's since been replaced** is thrown away (`runProfileExtraction` checks `raw_bio` again before saving an idea).
- **The idea's fate follows the role at save time,** so a reading that finishes after "Join as a builder instead" saves the idea as a draft.

## Order of work
1. The migration (`draft` and `public_idea`) and the server rule (`onboardingOutcome`, `checkJoin`, `joinPool`), with the P1-21 role change removed.
2. Onboarding UI: two routes, the settings line, route-specific step 2, review messages, Check again and the switch to builder.
3. Drafts: builder-route extraction, saving the draft, the welcome notice, post and discard, and the Me label.
4. The prompt change and its live test (after approval), then the docs: `PROGRESS.md` row P1-22, `PROMPT_TUNING.md`, and P1-21's follow-up marked superseded.

## Approvals needed
- **The migration on production** (`supabase db push`).
- **A live Claude test** of the builder-route prompt change: about 20 Haiku calls, under $0.01.
- **Commit and push.**

## Tests
- **Unit:** `onboardingOutcome` for each route × finished/pending × idea/skill/neither; the messages; `vague.ts` stays as it is.
- **Database:**
  - drafts are hidden from `public_board_ideas`, `public_idea` and the deck queries;
  - the owner can read their draft;
  - another member can't.
- **E2E (fake provider; slow runs through `[[fake-llm-delay-ms=…]]`):**
  1. The idea route with a placeholder is blocked. A real idea joins as `idea`.
  2. The builder route with no skill is blocked. A quick pick joins as `builder`.
  3. The idea route with a slow AI: Check again, then "Join as a builder instead", then a quick pick lets them join.
  4. The builder route with an idea in the sentence: they join as `builder`, the welcome notice links to the draft, and the draft isn't on the board or the event page. **Post it** makes it public and the person `both`.
  5. Going back and resubmitting doesn't reuse the first result.
  6. Step 1 asks "Do you have an idea, or do you want to find one to build?" with two routes and the settings line, before the sentence. The Me page still offers Both.
- **Existing tests that onboard as "Both"** (for example the no-horizontal-scroll test) switch to a route. Everything else is unchanged.
- **Full suite in CI mode,** with the dev server stopped before `pnpm build`.

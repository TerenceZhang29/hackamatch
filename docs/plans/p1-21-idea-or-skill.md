# P1-21: every profile needs an idea or a skill

Requested by the owner on 2026-10-21. Status: **built and tested locally (2026-10-21)**, including the live prompt test (results in `docs/PROMPT_TUNING.md`, `2026-10-21.1`).

## Context
On 2026-10-21 the owner asked me to check a pilot tester whose card text looked wrong. A read-only look at production found:
- **Sentence:** "I want to build a xxx" (role: both).
- **Extraction:** it ran with real Claude (prompt `2026-10-14.3`) and found no tags, which is correct for a placeholder.
- **The problem:** Claude wrote notes about the input instead of content, and the app published them.
  - The summary reads "Student wants to build a project but has not described it yet."
  - The idea's pitch reads "Student wants to build something, but the text names no product, problem, or user." It showed as "Ideas: …" on the card.
- **For comparison,** hz467's extraction is normal.

**The owner's rule (2026-10-21):**
- A person can join with skills and no idea. If no idea comes out of their text, they are recorded as **build only**, and their card shows their skills.
- If there is **no idea and no skill**, onboarding shows a warning and **blocks joining**.
- Everyone needs either an idea or a skill.

**Outcome:** placeholder input never creates an idea or a public note about the text. Every new member has a real idea or at least one skill.

**Also requested (2026-10-21):**
- Onboarding offers a few predefined common skills to tap, to ease friction.
- Create a ticket for this problem and record the plan.

## Changes

### 0. Ticket and plan record (first step)
- **`docs/PROGRESS.md`:** add the row **P1-21 "Every profile needs an idea or a skill"** (In progress), with a link to the plan. Mention the tester's case without their name: "a placeholder sentence produced a public note about the text".
- **`docs/plans/p1-21-idea-or-skill.md`:** this plan, in the repo's plan style. Include the owner's rule and decisions, with dates.
- **Launch tracker:** add item `i025`, section E, "P1-21: idea-or-skill rule at sign-up". It is owned by Claude, costs $0, and depends on approval of the live prompt test.

### 1. Quick skill picks at sign-up (`src/app/(focus)/onboarding/OnboardingFlow.tsx`)
- **Step 2 ("your sentence"):** below the sentence, add a row of optional toggle chips, "Quick picks". There are 10 common skill slugs from `src/lib/taxonomy/skills.ts`:
  - `frontend`, `backend`, `fullstack`, `mobile`, `ml`
  - `data-science`, `ux-design`, `product-management`, `hardware`, `business-development`
- **Labels** use `tagLabel` from `src/lib/taxonomy/labels.ts`. The list is a constant `QUICK_SKILLS` in `src/lib/onboarding.ts`.
- **Merging:** picked skills are joined with the extracted skills when step 3 opens. They show up as normal tags in the existing `TagEditor`, so they can be removed. When extraction is pending, the tags are just the picks.
- **Review step:** when the idea-or-skill warning shows, the same chips appear under it, so one tap fixes it without going back.
- The chips are plain buttons with `aria-pressed`, styled like the existing role and intent toggles. There's no new server input: picks travel in `tags` to `joinPool`, which already saves edited tags.

### 2. Detect empty ideas and notes about the text (`src/lib/llm/vague.ts`, new, pure)
- **`isPlaceholderText(text)`:** after removing filler ("I want to build", "a", "an app", "something"), what's left is empty or only placeholder tokens (`xxx`, `tbd`, `todo`, `stuff`, `...`, repeated letters).
- **`isMetaText(text)`:** the output talks about the input or what's missing, for example "the text", "names no", "not (yet) described", "no product/problem/user", "no skills stated", "unspecified".

### 3. Extraction (`src/lib/llm/extract-profile.ts`)
- **No idea in these cases:** the sentence is a placeholder, or the idea's pitch is a note about the text.
- **Neutral summary fallback:** when the summary is a note about the text, replace it with one built from the role and tags. Move the fake provider's `who` wording into `src/lib/llm/shared.ts` so production code can reuse it.

### 4. Role and the idea-or-skill rule (`src/server/profiles.ts`, `src/app/(focus)/onboarding/*`)
- **New pure helper `onboardingOutcome(role, hasIdea, tags)`** in `src/lib/onboarding.ts`, which returns:
  - `{ ok: true, role }`: `idea` or `both` with no idea becomes `builder`; everything else keeps its role;
  - `{ ok: false }` when there is no idea and no skill.
- **"A skill"** means at least one `skills` or `stack` tag. Areas (`domains`) alone don't count.
- **Review step ("Here's what we got", `OnboardingFlow.tsx`):**
  - When the text gave no idea and the role was idea or both, show the line "No idea found, so you'll join as a builder."
  - When there are no skill or stack tags and no idea, show a warning ("Add a skill, or go back and describe your idea, to join") and disable **Join the pool**.
  - The warning updates live as tags are added in the tag editor. Adding a skill there, or going Back and rewriting the sentence, unblocks it.
- **`joinPool` (server) enforces the same rule:**
  - it refuses with the same message if there's no idea and no skill after the tag edits;
  - on success it saves the outcome's role (`builder` when no idea).
- **Slow-LLM path:** when extraction is still pending, nothing can be judged yet, so joining stays allowed, as today. When the background extraction finishes, it applies the role change (no idea becomes builder). If it finds neither an idea nor a skill, the person stays in, and the admin can see them. Chosen so a slow API never blocks students; the alternative is to wait for tags before joining.
- **Out of scope:** the Me page (changing role or sentence later) and `/ideas/new`. Only sign-up is gated.

### 5. Prompt (root cause; needs approval for a live test)
In `src/lib/llm/prompts.ts`, version `2026-10-21.1`:
- **Summary:** describe the person only, never the text or what it lacks. This fixes backlog item B2.
- **Ideas:** placeholder or empty wording ("a xxx", "something") is not an idea, so return null.
- **Logging:** add the change to `docs/PROMPT_TUNING.md`, with standard **case 8**: "I want to build a xxx" (both) should give idea null and a summary that says nothing about the text.

### 6. The tester's existing data in production
Claude makes no production write. The owner archives the idea in `/admin/ideas`. To fix their role and summary, either the tester updates their sentence and role on the Me page, or the owner approves a one-row production update (role `builder` and a neutral summary). The tester has no skills, so under the new rule they couldn't sign up today. The account stays as it is either way.

## Approvals needed
- **A live Claude test of the prompt change:** about 16 Haiku calls (8 cases × 2), a few cents. The alternative is to ship steps 1 to 4 only. They fix the problem without any prompt change.
- **Commit and push.** No migration is needed.

## Verification
- **Unit tests:**
  - `isPlaceholderText` and `isMetaText`, using the tester's exact strings and normal pitches;
  - `onboardingOutcome`: every role, with and without an idea and skills;
  - every `QUICK_SKILLS` entry is a real skill slug;
  - `extractProfile`, with a stubbed LLM returning the tester's output, gives idea null and a neutral summary.
- **E2E (fake provider), `tests/e2e/onboarding.spec.ts`:**
  - **(a)** role Both with "I want to build a xxx" and no tags: the warning shows and Join is disabled. Adding a skill tag enables Join, and the person joins as a builder. Their card shows "Builds" and the skill, with no "Ideas:" line.
  - **(b)** an idea person with a real idea still joins as idea.
  - **(c)** a builder with skills is unchanged.
  - **(e)** a quick pick on step 2 appears as a tag on step 3 and counts as the needed skill. The chips have `aria-pressed`, and the axe check passes on both steps.
  - **(d)** the server refuses `joinPool` without an idea or a skill.
  - Update existing onboarding tests where a "both" sentence with no idea now ends as a builder.
- **Full suites:** `pnpm lint`, `typecheck`, `format:check`, `test`, `test:db`, and the full e2e run in CI mode. Stop the dev server before `pnpm build`.
- **After deploy:** a read-only production check of new sign-ups' role and summary.

## Follow-up: closing the gaps (planned 2026-10-21; superseded by [P1-22](./p1-22-signup-routes.md), not built)

A review after shipping found three places where "an idea or a skill" doesn't fully hold. All three are code-only changes with no AI calls and no migration.

### 1. A slow AI no longer skips the rule
- **Today:** when extraction takes over 8 s or fails, `checkJoin` returns "pending" and anyone can join.
- **Change:** while pending, joining needs at least one skill or tool among the submitted tags, from a quick pick or typed. The review step says "Still reading your sentence." and shows the quick picks, plus a **Check again** button.
- **Check again** calls a new server action, `onboardingStatus()`. Once extraction has finished, it returns the same result `submitSentence` gives, and the page switches to the normal review (with the idea box, or the warning).
- `extractInBackground` keeps running, so a person who picked a skill and joined still gets their tags and idea afterwards, as today.
- **Server (`joinPool`/`checkJoin`):** "pending" is allowed only when the submitted tags have a skill. Otherwise it refuses with the pending message.

### 2. Clearer messages
Shown on the page and by `joinPool`, chosen by role, in `src/lib/onboarding.ts`:
- **idea or both, no idea and no skill:** "We couldn't find an idea in your sentence. Describe it, or add a skill to join as a builder."
- **builder, no skill:** "Add at least one skill to join."
- **pending, no skill:** "Still reading your sentence. Add a skill to join now, or check again in a moment."

### 3. No stale result after going back
- **Today:** resubmitting the sentence keeps the previous run's `extracted_at` and onboarding idea until the new run finishes. If the new run times out, `joinPool` judges the old sentence.
- **Change:** `saveOnboardingBasics`, for a user not yet onboarded, clears `profiles.extracted_at` and deletes their onboarding idea whenever the sentence or role changes. A timed-out rerun is then "pending" (rule 1), never stale.

### Not included
A dictionary check for gibberish ("asdf qwerty"). It's left to the prompt, which returned no idea in every live run of case 8. Revisit only if a gibberish idea shows up in production.

### Tests
- **Unit:** the message chosen for each role and state; the pending rule.
- **E2E (fake provider, using the `[[fake-llm-delay-ms=…]]` hook):**
  - a slow extraction with no skill: Join is disabled with the pending message; a quick pick enables it; the person joins, and the tags arrive later;
  - **Check again** after the delay shows the normal review;
  - going back and resubmitting with a slow run doesn't reuse the first run's idea;
  - the idea-person message for a sentence with no idea.
- The existing "a slow LLM does not block joining" test changes: it now picks a skill before joining. The full suite runs in CI mode.

# Plan: show and edit your name on `/me`

**Status: planned and built 2026-10-17.** The full name shows under the page heading (or an "Add your name" link), and a "Your name" section saves it with the onboarding rule (`nameField` in `src/app/onboarding/schema.ts`, shared by both). Requested by the owner after the first production sign-up: the owner signed up as "Test User" and found no way to change it.

## The problem

- **The name can only be set during onboarding.** `/me` has sections for the sentence, tags, role, events, ideas, pause and delete, but none for the name. A student who makes a typo, or leaves it blank, can only have it fixed with SQL.
- **`/me` doesn't show the name at all.** The header shows "Your profile" and the summary, so a user can't see what name others see.

The database already allows the change: `name` is in the column grant users have on their own `users` row (`20261009000002_rls.sql`). Only the page and its action are missing.

## What to build

1. **Show the full name on `/me`.** The full name as stored, for example "Maya Patel", near the top of the page. If no name is set, show a prompt to add one instead.
   - Say who sees what: public pages (the board, `/people/[id]`, idea pages) show "Maya P." (`display_name`); match emails and the pair page show the first name, "Maya" (`firstName` in `src/server/matches.ts`). The full name is seen only by the user and admins.
2. **A "Your name" section** on `/me`, in the style of the other sections (`Section` in `src/app/me/sections.tsx`): a text field with the current name and a Save button, with the usual "Saved" or error outcome.
3. **A `saveName` server action** in `src/app/me/actions.ts`, following `saveSentence`:
   - Validate with the same rules as onboarding (`src/app/onboarding/schema.ts`): trimmed, at most 80 characters; empty clears the name, so public pages fall back to "Cornell student".
   - Update only the signed-in user's own row (`updateName` in `src/server/profiles.ts`, keyed on the session's user id, like the other `/me` updates).
   - No LLM or embedding call: the name isn't part of the embedding or the tags. No new rate limit needed.
   - Revalidate `/me` so the header updates.
4. **Analytics:** none required. If one is added, it goes in the analytics check (`pnpm check:analytics`).

## Tests

- **Unit:** the name schema: trims, caps at 80, empty becomes null. Reuse or share the onboarding rule rather than copying it.
- **E2E** (`tests/e2e/me.spec.ts`): `/me` shows the full name; changing it saves, shows "Saved", and the board or person page then shows the new "First L." form; clearing it shows the add-a-name prompt.
- **Accessibility:** the existing axe check on `/me` (`tests/e2e/a11y.spec.ts`) covers the new field; the field needs a visible label.

## Out of scope

- Changing the email address (the Cornell address is the identity).
- Name rules beyond onboarding's (no real-name check).

## Release

A normal commit to `main`; Vercel redeploys it. No migration, no new environment variable, no cost. Until it ships, the owner's own name is fixed with the SQL update in the chat of 2026-10-17 (`update public.users set name = … where cornell_email = …`).

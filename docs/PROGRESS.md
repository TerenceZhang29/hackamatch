# HackaMatch — Progress

Ticket status and the decisions made while building. Specs live in [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md); update this file whenever a ticket changes state. Prompt changes and their live-test results are logged in [`PROMPT_TUNING.md`](./PROMPT_TUNING.md).

Last updated: 2026-10-14

## Phase 1 — MVP

| Ticket | Status | Notes |
| --- | --- | --- |
| P1-01 Project scaffold | Done | Commit `0846317` |
| P1-02 Database schema and Supabase setup | Done | Commit `b78202c` |
| P1-03 Magic-link auth restricted to Cornell | Done | Token-hash link with a confirm button (see below) |
| P1-04 LLM wrapper, prompts, and taxonomy | Done | Claude (`claude-haiku-5-5`) verified live on 2026-10-14 with prompt `2026-10-14.3`; Gemini verified on 2026-10-13 with an older prompt. See [`PROMPT_TUNING.md`](./PROMPT_TUNING.md) |
| P1-05 Embeddings wrapper | Done | Verified against the real Voyage API on 2026-10-13 (see below) |
| P1-06 Onboarding flow | Done | Three-step flow; slow-LLM fallback fills tags in the background (see below) |
| P1-07 GitHub and LinkedIn import | Done | GitHub summary now stored in `profiles.github_summary` (see below) |
| P1-08 Profile page and settings | Done | `/me`: sentence, tags, role, events, ideas, pause, delete |
| P1-09 Post an idea | Done | `/ideas/new` with preview; `/ideas/[id]` owner and public views; `public_idea` SQL function |
| P1-10 Public board | Done | Board with tabs, filters, load more; `/join` and `/people/[id]` |
| P1-11 Interested / Pass from the board | Done | Board, idea and person pages; `/matches` sections; atomic `respond_to_pair` |
| P1-12 Notifications foundation | Done | Email via `send()`, signed one-click links, atomic mutual reveal (see below) |
| P1-13 Shared pair page and "We teamed up" | Done | Pair page, event picks, one team per match and event |
| P1-14 Admin tools | Done | Users, ideas, events, hand-made matches; 404 for non-admins |
| P1-15 Analytics events | Done | `pnpm check:analytics` in CI; `digest_sent` waits for P2-06 |
| P1-16 Phase 0 import and seeding | Done (scripts) | Import and `seed:dev` ready; real data not imported (no Phase 0 files yet) |
| P1-17 Event pages and tagging | Done | `/e/[slug]` share page; join links preselect the event in onboarding |
| P1-18 Security and privacy hardening | Done | CSP and headers, Postgres rate limits, audit in [`docs/security.md`](./security.md) |
| P1-19 E2E suite and accessibility pass | Done | Full journey and axe checks on every page; fixed seeded-id 404s |
| P1-20 Production deploy and pilot readiness | In progress | Phase A (runbook, `vercel.json`, metrics queries) done 2026-10-14. Decisions answered 2026-10-14 (`vercel.app` for now, free tiers, no previews; pilot event TBD) in [`plans/p1-20-deploy.md`](./plans/p1-20-deploy.md). 2026-10-15: production Supabase project created (`us-east-1`, Free), all 9 migrations pushed, schema matches local, RLS on all 14 tables; read-only checks via `scripts/prod-read.sh`. Next: Resend key, Vercel, Supabase auth settings. Checklist: [`runbooks/deploy.md`](./runbooks/deploy.md) |

Phases 2 and 3 have not started.

## P1-03: change to a token-hash magic link

**Decided 2026-10-09. Status: implemented 2026-10-09.**

### Why

The first version used Supabase's code-exchange flow, which stores a verifier in the browser that requested the link. A student who asks for the link on a laptop and opens the email on a phone could not sign in.

### What changes

- The emailed link points at the app (`/auth/confirm?next=…&token_hash=…&type=email`) through custom Supabase email templates, and the app verifies the token hash. No browser-stored verifier, so the link works on any device.
- `/auth/confirm` is a page with one button. Loading it verifies nothing; pressing the button posts to a server action that verifies the token and signs the user in.
- `/auth/callback` is removed.

### Decision: button, not verify-on-load

Chosen by the project owner on 2026-10-09.

- Mail scanners and link previews open links with a plain GET. Verifying on load would let them use up the single-use token, and the student's own click would then fail with "link expired". Everyone in the pilot is on the same mail system, so this could affect most users at once.
- Not confirmed: whether Cornell's Outlook setup fetches links on delivery. The button was chosen so the pilot does not depend on the answer.
- Cost accepted: one extra tap on every sign-in.
- Revisit by sending a link from a hosted project to a real Cornell inbox. Switching to verify-on-load later only changes the confirm page.

### Work items

- [x] `supabase/templates/magic_link.html` and `confirmation.html`, registered in `supabase/config.toml`
- [x] Redirect allow-list changed to `…/auth/confirm**`
- [x] `src/app/auth/confirm/page.tsx` and `actions.ts`
- [x] `src/app/login/actions.ts` sends `emailRedirectTo` = `/auth/confirm?next=…` (always with `next`)
- [x] Remove `src/app/auth/callback/route.ts`
- [x] Login copy: drop "open it in this browser"; error reads "expired or already used"
- [x] E2E: existing flows updated; new cross-browser, scanner-prefetch and used-link cases
- [x] README updated
- [x] Lint, typecheck, unit, database, build and e2e (production build) pass

### Outcome

- `verifyOtp` accepts the token hash from the server client's default flow without a verifier; the cross-browser e2e test passes, so the implicit-flow fallback was not needed.
- E2E: 24 pass against the production build (desktop and mobile), including the cross-browser, scanner-prefetch and used-link cases.

### Still open

- The `confirmation` template is not exercised locally, because local Supabase has email confirmations off and sends `magic_link` to first-time users too. Check it on the hosted project during P1-20.
- Whether Cornell's mail system fetches links on delivery is still unconfirmed.

## P1-04 and P1-05: LLM and embeddings wrappers

**Implemented 2026-10-13.**

### Not yet verified

Claude is the pilot provider (owner's choice, 2026-10-14). It was verified live on 2026-10-14: 57 approved calls over a baseline and three prompt rounds, ending with version `2026-10-14.3` passing all seven standard cases twice. Gemini has not been re-run on the current prompt. Details in [`PROMPT_TUNING.md`](./PROMPT_TUNING.md).

### Gemini provider (added 2026-10-13)

Added at the owner's request as a no-cost alternative to Claude: `LLM_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.5-flash-lite`). The Anthropic provider is unchanged and remains the production default.

- Uses Google's Interactions API (`POST /v1beta/interactions`, `response_format` with a JSON schema, `store: false`).
- **Verified live 2026-10-13** with four calls through `extractProfile` / `extractIdea` on `gemini-3.5-flash-lite`, approved by the owner. All four were accepted, validated on the first attempt, and took 1.0 to 1.4 s. About 900 tokens in and 100 out per call. Every tag returned was in the taxonomy, and the word limits held.
- The first prompt version invented an idea for a `both` user who described none, and padded tags and pitches. Prompt version `2026-10-13.2` fixed all three on re-run. Two smaller tagging misses are still open (an idea's needs read as the person's skills; a job title not turned into a skill); details are in [`PROMPT_TUNING.md`](./PROMPT_TUNING.md).
- A rate-limit response (429) is not retried. `extractProfile` throws `LlmError`, which P1-06 already handles by filling tags in the background.
- Gemini accepts a subset of JSON Schema, so `toGeminiSchema` rewrites nullable values as type lists and drops other keywords; zod still validates the full schema.

### Voyage: verified 2026-10-13

Two real calls through `createVoyageEmbedder` (`voyage-4-lite`, 1024 dimensions), approved by the owner; 13 tokens billed in total.

- Document call with three texts returned three unit vectors of 1024 numbers, in order.
- Cosine: "react health app" vs "health app built in react" = 0.980; vs "hardware climate sensor" = 0.494.
- Query call returned a 1024-number vector; "react developer for a health app" scored 0.777 against the react text and 0.202 against the hardware text.
- Real vectors for unrelated short texts still score around 0.5 on document-to-document comparison, far above the fake embedder's near 0. Matching thresholds (P2-02) must be tuned on real embeddings, not on the fake.

### Choices that differ from the plan

- **JSON schema comes from zod itself.** The plan named `zod-to-json-schema`; the project is on zod 4, which has `z.toJSONSchema` built in, so no extra dependency was added.
- **Extra files.** `src/lib/llm/types.ts` and `src/lib/embeddings/types.ts` hold the shared interface and error class, so the fake providers do not import the real ones.
- **`timeoutMs` is one deadline for the whole call,** including the validation retry, so onboarding's 8 s budget (P1-06) cannot be doubled by a retry.
- **A refusal is not retried;** a response with no tool call is retried once with the same request.
- **Embedding text leaves out empty sections** rather than emitting bare labels.
- **`embedProfile` takes the GitHub summary as an optional argument.** Since P1-07 it defaults to the stored `profiles.github_summary`.

### Things the next tickets should know

- The forced tool call works on the Haiku family (the `LLM_MODEL_FAST` default). Current Opus and Sonnet models reject a forced `tool_choice`, so changing `LLM_MODEL_FAST` to one of them needs a change in `src/lib/llm/client.ts`.
- The fake LLM answers only the tools `record_profile` and `record_idea`. P2-04 (reason lines) must add a rule to `src/lib/llm/fake.ts`.
- The taxonomy has 167 slugs (48 skills, 77 stack, 42 domains). Slugs are stored in the database, so renaming one needs a data migration.

## P1-06: onboarding

**Implemented 2026-10-14**, in the unattended run of P1-06 to P1-19 (summary at the end of this file).

### What landed

- `/onboarding`: one page, three steps (who you are; one sentence; review tags, optional clarifying answer and events, "Join the pool"). A builder joins with two taps (role, Continue), one sentence and one click; the e2e test asserts it takes under 60 s.
- `src/server/profiles.ts` holds the writes (service client, after `requireUser`); `src/server/events.ts` lists upcoming events in `APP_TIMEZONE`.
- If extraction misses the 8 s budget or fails, the user sees "We'll fill in your tags in a moment", joins anyway, and extraction re-runs after the response with a 30 s budget, then re-embeds if they have already joined.
- Joining embeds the profile and ideas after the response, applies the clarifying answer (appended to the idea text, then re-extracted), records `pool_joined` with `seconds_since_link_click`, and redirects to `next` or `/matches?welcome=1`.

### Choices made without the owner

- **Re-running step 2 replaces the onboarding idea** rather than adding a second one, while the user is still onboarding. A late background run after joining only adds the idea if the user has none.
- **`user_edited` is set by comparing against the stored tags,** not by trusting the client, so untouched LLM tags stay refreshable.
- **Tag chips show slugs with spaces** (`ux design`); the taxonomy has no display labels yet.
- **Step 1 and step 2 are both recorded when step 2 is submitted** (`onboarding_step_completed`), since step 1 never reaches the server on its own.
- **Test hook in the fake LLM:** a prompt containing `[[fake-llm-delay-ms=N]]` makes the fake wait N ms and time out past the deadline. It exists only in the fake provider, for the slow-LLM e2e test.
- The onboarding page shows "Signed in as …" with the sign-out button (the P1-03 e2e tests rely on the email being visible there).

### Notes for later tickets

- E2E sign-in helpers moved to `tests/e2e/auth.ts`; `tests/e2e/helpers.ts` gained `query` and `eventually` (poll until work done in `after()` lands).
- Local stack gotcha: if magic-link emails come out with Supabase's default template, the auth container predates the custom templates. `pnpm exec supabase stop && pnpm db:start` recreates it.

## P1-07: GitHub and LinkedIn import

**Implemented 2026-10-14.**

- Step 2 of onboarding has a collapsed "Or import from GitHub or LinkedIn" row: GitHub profile link, LinkedIn profile link, and a box to paste LinkedIn About or Experience text.
- `src/lib/imports/github.ts` reads `github.com/<user>` only (repository links, other hosts, query strings are rejected), calls the two public endpoints with a 5 s deadline (`GITHUB_TOKEN` sent when set), and builds a summary of bio, top languages, topics and the five most recent non-fork repositories, capped at 1,500 characters. Any failure returns null.
- A GitHub link can replace the sentence. If GitHub can't be read and there is no sentence, the user is asked to write one. The GitHub name fills an empty first-name field.
- LinkedIn is never fetched: the link is stored in canonical `https://www.linkedin.com/in/<handle>` form, and pasted text (capped at 3,000 characters) goes to extraction.

### Decision made without the owner

- **The GitHub summary is stored** in a new `profiles.github_summary` column (migration `20261014052358_profile_github_summary.sql`), so re-extraction and re-embedding include it, not just the onboarding request. It is public GitHub data and is never shown to other users. Users cannot write it directly (not in their column grant). `embedProfile` and `runProfileExtraction` now read it from the database.

### Tests

- Unit tests run against recorded GitHub responses in `tests/fixtures/github/`; the acceptance case (GitHub link, empty sentence, non-empty stack tags) runs there with the fake LLM.
- E2E covers the LinkedIn paste and a rejected non-profile GitHub link. No e2e test calls the real GitHub API.

## P1-08: profile page and settings

**Implemented 2026-10-14.**

`/me` has: the sentence (saving re-infers the summary and tags, with the same 8 s budget and background fallback as onboarding, then re-embeds); tags (saving sets `user_edited` only on a real change); role and intents; hackathons (each toggle saves at once); the user's ideas with Open / Filled / Archived; notifications (email address shown, pause for a week / a month / until turned back on, or resume); and account deletion.

### Choices made without the owner

- **Notification channel is shown, not editable.** The plan says email only for now, so the section names the address and offers pause; a channel picker can come with SMS (P3-04).
- **Deleting needs the word "delete" typed,** then signs the user out and deletes the auth user; everything else cascades. The plan said "confirms" without saying how.
- **Pause logic lives in `src/lib/pause.ts`** (pure, unit tested). "Until I turn it back on" stores `9999-12-31`, as the plan says.
- **Re-extraction after a sentence edit never adds an idea** for an onboarded user who already has one (same rule as the late background run in P1-06).

## P1-09: post an idea

**Implemented 2026-10-14.**

- `/ideas/new`: one text box and an optional hackathon. "Preview" runs extraction (8 s budget) and shows the public pitch, area, scope and skills needed, plus the clarifying question as an optional field. "Post" saves and opens `/ideas/[id]`; embedding (and the clarifying answer, or extraction if the preview timed out) runs after the response.
- `/ideas/[id]`: the owner sees the full text and can answer the clarifying question, edit skills needed, area and scope, and set Open / Filled / Archived. Everyone else sees the pitch and tags only; logged-out visitors get "Sign in to connect" (back to the idea after sign-in). A user with a revealed match on the idea also sees the full text. The Interested / Pass slot is left for P1-11.
- New SQL function `public_idea(id)` (migration `20261014053816_public_idea.sql`): public columns of one idea, never `raw_text`, hidden when archived or when the owner is paused or not onboarded.
- A builder who posts an idea becomes `both`. `idea_posted` is recorded.

### Choices made without the owner

- **Filled ideas stay viewable** at their link with "This idea has a team"; archived ones are a 404 for everyone but the owner.
- **The preview's pitch and tags come back from the browser** when posting (so the user posts what they saw, without a second LLM call). Tags are re-normalized on the server and the pitch is capped at 200 characters; the owner can only affect their own idea's public fields, which they can edit anyway.
- **If preview extraction times out,** the idea is posted with an empty pitch and extraction finishes in the background; the page shows "Writing your pitch…" until then.
- `tagLabel` moved to `src/lib/taxonomy/labels.ts` so server components can use it.

### Gotcha

`pnpm exec supabase migration new <name>` reads SQL from standard input when it is not run in a terminal, so in scripts it waits forever. Run it with `< /dev/null`, or create the file by hand with a UTC timestamp prefix.

## P1-10: public board

**Implemented 2026-10-14.**

- `/` is the board: Ideas and Builders tabs (Builders includes `both`), featured first then newest, 20 at a time with "Load more" (`?n=40`, capped at 100). Filters for hackathon, area, skill and "looking for" are a plain GET form, so they work without JavaScript and every filtered view has a shareable URL; empty fields are redirected away so URLs stay short.
- Logged out: the hero and "Join with your Cornell email". Every card's "Interested" goes through `/join`, which records `cta_clicked` and sends the visitor to sign in with `next` set to that card. Logged in but not onboarded: cards say "Finish joining to connect". Onboarded: the card action slot is left for P1-11, and the board hides the viewer's own cards and everyone they already have a match with.
- Migration `20261014060000_board_filters.sql` replaces `public_board_ideas` and `public_board_people` with versions that take domain, skill, intent, event and an exclusion list of user ids, adds `intents` to people rows, and adds `public_person(id)`.
- `/people/[id]` shows one builder's public card (a 404 when they are paused or not in the pool); `board_viewed` is recorded after each render.

### Choices made without the owner

- **The exclusion list is a parameter of the public SQL functions** rather than read from the caller's session. It can only remove rows, so passing arbitrary ids reveals nothing, and the functions stay callable by `anon`.
- **Builder cards link to `/people/[id]`,** the "card" the plan's logged-out flow returns to; the plan listed the route in the repository layout but no ticket specified it.
- **`/join` is a GET that records a click.** Links to it set `prefetch={false}` so Next.js prefetching never counts as a click.
- **The board's skill filter matches a person's skills or stack,** and an idea's skills needed.

## P1-12: notifications foundation

**Implemented 2026-10-14**, before P1-11 because P1-11 depends on it.

- `src/server/notify.ts` `send()`: looks up the user's channel (email only in Phase 1; `none` is logged as skipped), renders a React Email template to HTML and plain text, adds `List-Unsubscribe` and `List-Unsubscribe-Post` headers, sends, and records `notification_log` (provider id, or `failed`). Digest kinds are inserted into the log first, so the one-per-day unique index stops a second send. Failures are logged, never thrown.
- Providers: Resend over its REST API (`src/lib/notify/resend.ts`), and a fake that writes each email to `.tmp/outbox/<id>.json` and `.html` (`src/lib/notify/fake.ts`).
- Signed one-click links (`src/lib/notify/tokens.ts`): base64url payload plus HMAC-SHA256, constant-time check, 30-day expiry for match links and 180 days for footer links. Outside production a fixed development secret is used when `RESPONSE_TOKEN_SECRET` is unset.
- `/r/[token]`: loading the page changes nothing. The buttons post to server actions, which record the answer (either answer, so "Change my answer" works from the same link) or pause matches. Expired or tampered links show an error with "Sign in". `POST /r/[token]/unsubscribe` is the RFC 8058 one-click unsubscribe; a GET only redirects to the confirm page.
- `src/server/matches.ts`: `recordResponse`, the atomic `revealIfMutual` (one conditional UPDATE, so simultaneous clicks reveal once), mutual emails with Cornell email, GitHub and LinkedIn plus a suggested coffee-chat message, and `sendInboundInterest` for P1-11 and P1-14. Templates: `Layout`, `InboundInterest`, `Mutual`.
- `src/lib/llm/coffee-chat.ts`: up to 50 words, template fallback; the fake LLM has a `write_coffee_chat` rule.

### Choices made without the owner

- **`send()` lives in `src/server/notify.ts`,** not `src/lib/notify/index.ts` as the plan's layout says: it uses the service client, which ESLint only allows under `src/server/`.
- **One footer link** ("Pause matches or manage notifications") opens a token page with pause options and a link to `/me`, instead of two separate links. Unsubscribing in one click pauses until the user turns matches back on.
- **Changing an answer after a reveal does not hide contact details** that were already emailed.
- **Resend is called with `fetch`,** not the Resend SDK, to avoid a dependency for one endpoint.
- **Vitest now uses the automatic JSX runtime** (`esbuild.jsx = "automatic"`), matching Next.js, so templates render in unit tests.

## P1-11: Interested / Pass

**Implemented 2026-10-14.**

- Board cards, idea pages and person pages have Interested / Pass for onboarded members. They are plain form posts to a server action (they work without JavaScript) that redirect back with the outcome in the URL (`?sent=1`, `?passed=1`, `?matched=<id>`, `?error=limit`).
- `respond_to_pair` (migration `20261014070000_respond_to_pair.sql`) inserts the pair's match with the actor's answer, or updates only the actor's side, in one statement; two people answering each other at the same moment get one row (tested on two real connections). Server-only: not executable by signed-in users. `interests_today` counts today's Interested answers in `APP_TIMEZONE`.
- `answerFromBoard`: the first Interested emails the other person (capped at 3 "interested" emails per recipient per local day; beyond that the match waits on `/matches` with a "New" badge); a second Interested reveals the match through the P1-12 path. More than 15 Interested in a day is refused with a friendly message.
- `/matches` has Waiting on you, Mutual and Sent. Matches the viewer passed on are hidden; the other person's answer is never shown before a reveal.

### Choices made without the owner

- **A card's target is its person:** Interested on an idea card matches the viewer with the idea's owner, recording the idea on the match. One match per pair stays the rule, so a later interest in a second idea from the same person reuses the pair's match.
- **"New" means created in the last 24 hours** while still waiting on the viewer. There is no read tracking yet.
- **Idea and person pages show where the viewer stands** ("You said you're interested", "You passed", or a link to the mutual match) instead of buttons once they have answered.

### CI incident

The P1-12 commit failed CI at `pnpm install --frozen-lockfile`: pinning the new React Email versions also stripped the `^` from the existing `@anthropic-ai/sdk` range, so `package.json` no longer matched the lockfile. Fixed in `c6ba88d`. The pre-push checks now include a frozen install.

## P1-14: admin tools

**Implemented 2026-10-14**, before P1-13 because P1-13 depends on it.

- `/admin` (counts), `/admin/users` (search, role, intents, joined, last active, match counts, pause / unpause, make or remove organizer), `/admin/ideas` (feature, status), `/admin/events` (list, create; `/admin/events/[id]` edits) and `/admin/matches` (match two people by hand, all matches with both answers).
- Every `/admin` page is a 404 for anyone but an admin (`requireAdmin` in the layout and in each page and action).
- A hand-made match has source `admin`, a reason line for each side, an optional idea and event, and sends each person a "We think you should meet …" email with one-click Interested / Pass. A pair that already has a match is refused.
- Event slugs are made from the name (`src/lib/slug.ts`), with `-2`, `-3` … when taken, and are kept when an event is renamed, since the slug is the shareable link.

### Choices made without the owner

- **People are picked by typing a name or email** with suggestions (an HTML `datalist`), rather than a custom searchable select, so the form needs no JavaScript.
- **Admin pause is "until turned back on"**, and unpause clears it.
- **Lists show the newest 500 rows,** enough for the pilot; pagination can come later.

## P1-13: shared pair page and "We teamed up"

**Implemented 2026-10-14.**

- `/matches/[id]` opens only for the two people in a revealed match (a 404 for anyone else, and before the reveal). It shows both people (the other person's Cornell email, GitHub and LinkedIn), the full idea text, a suggested first message with a Copy button, and "Matches never expire, and you both stay in the pool."
- Upcoming hackathons: each is a toggle for the viewer; the other person's pick shows as "Maya would", and events both picked are highlighted "You both want this". Picks are `match_event_votes`.
- "We teamed up" asks "For which event?" (events both picked come first and are preselected; "No event / side project" is last). It creates the team with both members, stamps `teamed_up_at` and records `team_formed`, through the server-only `team_up` SQL function and a unique index on (match, event), so repeated or simultaneous presses make one team (migration `20261014080000_team_up.sql`).
- Either member can add a teammate by Cornell email, but only someone they have a revealed match with. Once a team exists, the idea owner is offered "Mark this idea as filled".
- With `SHOW_EXISTING_TEAMS` on, an event shows "Maya already has a team for this" when the other person is on a team for it through another match.

### Choices made without the owner

- **The suggested message on the page is the template,** not a fresh LLM call on each page view. The mutual email carries the LLM-written one; storing it would need a new column, and a template costs nothing to show.
- **"No event" counts as one event** for the one-team rule, so a pair can have one side-project team plus one team per event.

### Test helper fix

`signIn` in `tests/e2e/auth.ts` now waits for the confirm page to finish before returning; tests that touched the database right after signing in could otherwise race the sign-in POST.

## P1-15: analytics check

**Completed 2026-10-14.**

- `scripts/check-analytics.mts` (`pnpm check:analytics`, run in CI after the typecheck) fails if any name in `ANALYTICS_EVENTS` never appears as a string literal in `src/` outside `src/lib/analytics.ts`.
- Every Phase 1 event is emitted. `digest_sent` is listed in the script's `NOT_YET` table for P2-06; the script fails once it is emitted and still listed, so the table cannot go stale.

### Choice made without the owner

- **`digest_link_clicked` is recorded when someone answers from any emailed one-click link** (inbound interest, admin intro, and later digests), with the answer in its props. It is recorded on the button press, not on page load, because mail scanners load links. The plan only named it for digests; this makes Phase 1 email clicks measurable too.

## P1-16: Phase 0 import and dev seed

**Implemented 2026-10-14.** The scripts are ready; nothing has been imported, since there are no Phase 0 files in the repository.

- `pnpm import:phase0 --signups … --ideas … --matches … [--dry-run]` and `pnpm import:phase0 --send-welcome --signups …`, documented in `docs/runbooks/import-phase0.md`. CSV parsing and row mapping (`src/lib/csv.ts`, `src/lib/phase0.ts`) accept the Google Form wording ("I have an idea", "hackathon partner; co-founder", "1"/"2" replies). The import (`src/server/phase0-import.ts`) creates accounts without sending email, infers tags and ideas, tags events, joins the pool and embeds; seed ideas become featured; matches keep their answers, mutual ones are revealed, and `teamed_up` creates the team. Re-running skips what exists.
- `pnpm seed:dev`: 60 generated users through the same importer with the fake LLM and embedder, plus embeddings for the `seed.sql` users. Refuses non-local databases and real providers.
- Scripts run with `tsx` (new dev dependency) using `--env-file=.env.local --conditions=react-server`, so they share the app's code and `server-only` modules.

### Choices made without the owner

- **Unknown events are reported, not created.** The plan said to create missing events "flagged for admin review", but events need dates, which the sheets don't have. The import lists unknown names; create them in `/admin/events` and re-run.
- **Seed ideas whose `owner_email` has no account go to the first admin** (or `--admin-email`).
- **Welcome emails use the existing magic-link email** and land on `/me`. A dedicated "claim your profile" email would need a new Supabase template.
- **`seed:dev` makes 35 ideas, not 25:** the 25 idea people and the 10 "both" users whose sentences describe a product each get one.
- **The import is tested end to end** in `tests/db/phase0-import.test.ts`, which runs the CLI on `tests/fixtures/phase0/` (dry run, import, re-run) against the local database.

### Before importing real data

Running the import against production with real data, and sending welcome emails, both need the owner: the CSVs, the production environment, and approval to email students.

## P1-17: event pages and tagging

**Implemented 2026-10-14.**

- `/e/[slug]` is the link organizers share: name, dates, team size, description and website, "N people are looking for teammates" (onboarded, unpaused people who tagged it), up to six ideas and six builders tagged with it (with Interested / Pass for members), and a link to the filtered board when there are more. Past events say "This event has ended" and offer no join button; unknown slugs are a 404.
- Logged out, "Find a team for this event" goes through `/join` (recording `cta_clicked`) to sign in with `next=/e/<slug>?join=1`. A new user then lands on onboarding with that event preselected, and joining the pool returns them to the event page. A signed-in member opening a `?join=1` link has the event tagged and is sent to the clean URL; members can also toggle "I'm interested in this event" / "I'm not going after all".

### Choice made without the owner

- **Opening a `?join=1` link while signed in tags the event on a GET.** Only a signed-in member's own request does this (mail scanners are never signed in), and it is what lets a sign-in round trip finish the join without another click.

## P1-18: security and privacy hardening

**Implemented 2026-10-14.** The audit checklist is [`docs/security.md`](./security.md).

- Content-Security-Policy with a per-request nonce (`src/middleware.ts`, `src/lib/csp.ts`) plus static headers in `next.config.ts`; the whole e2e suite runs under it.
- Rate limits in Postgres (`rate_limits` table and server-only `hit_rate_limit`, migration `20261014090000_rate_limits.sql`): sign-in emails 5 per address and `LOGIN_RATE_LIMIT_PER_IP` (default 20) per IP per hour; LLM-backed requests 30 per user per hour; ideas 20 per user per day; Interested / Pass 60 per user per hour. The limiter fails open if Postgres can't be reached.
- Event websites in the admin form must be `http(s)` links.

### Choices made without the owner

- **More limits than the plan named.** The plan asked for sign-in and interest limits; the LLM and idea limits were added to cap API spend if an account is abused.
- **Styles allow `'unsafe-inline'`** in the CSP, because Next.js and React set inline styles; scripts are nonce-only.
- **The per-IP sign-in limit is configurable** (`LOGIN_RATE_LIMIT_PER_IP`) because e2e signs in many users from one address, and because a campus network may put many students behind one IP; watch for false refusals at the pilot.

## P1-19: e2e suite and accessibility pass

**Implemented 2026-10-14.**

- `tests/e2e/journey.spec.ts`: two students from sign-up to a recorded team entirely through the UI: onboarding, the board filtered by skill, Interested, the inbound email's one-click link, the mutual email, picking a hackathon together on the pair page, "We teamed up", and marking the idea filled.
- `tests/e2e/a11y.spec.ts`: axe (`@axe-core/playwright`, WCAG 2.1 A/AA plus best practices) on the board, builders tab, login, event, person and idea pages, all three onboarding steps, `/matches`, the pair page, `/me`, the new-idea form, both one-click link pages and every admin page, on desktop and mobile. Serious and critical violations fail the test; at the time of writing there are none of any severity.
- Fixes it led to: admin tables that scroll sideways are keyboard-focusable regions; card headings follow each page's outline; person pages have an `h1`; a not-found page with a `main` landmark.
- **Bug fixed:** ids were validated with zod's strict `z.uuid()`, which rejects the seed data's `…-c000-…` ids, so seeded ideas were a 404 and their Interested buttons did nothing. Id checks now use `z.guid()`, which accepts any UUID-shaped value, as Postgres does.
- The plan's helper names map to `signIn` (`tests/e2e/auth.ts`) and `readOutbox` (`tests/e2e/helpers.ts`).

Suite size at the end of the run: 201 unit tests, 51 database tests, 142 e2e tests (71 per browser project), all passing locally, with no flaky tests in the final two full runs.

## Unattended run of P1-06 to P1-19: summary

**2026-10-14.** The owner asked for P1-06 through P1-19 in order, each pushed to `main`, while they were offline. All fourteen are done. P1-12 went before P1-11 and P1-14 before P1-13, because the plan makes those depend on them.

### Please review

These choices were made without the owner. Each ticket's section above has the reasoning.

1. **The board's Interested on an idea card matches you with the idea's owner,** one match per pair (P1-11).
2. **More rate limits than the plan named:** LLM-backed requests, idea posts and answers per hour, on top of the sign-in limits (P1-18). The per-IP sign-in limit (`LOGIN_RATE_LIMIT_PER_IP`, default 20 an hour) may need raising if many students share a campus IP.
3. **`digest_link_clicked` counts answers from any emailed link,** not just digests (P1-15).
4. **Unknown events in the Phase 0 sheets are reported, not created,** because the sheets have no dates (P1-16).
5. **The GitHub summary is stored** in `profiles.github_summary` (P1-07).
6. **Account deletion asks the user to type "delete"** (P1-08).
7. **The pair page shows the template coffee-chat message;** the LLM-written one is only in the mutual email (P1-13).

### What still needs the owner

- **P1-20 (deploy):** the hosted Supabase and Vercel projects, the sending domain and its DNS records, the secrets, the two auth email templates, and a test send to a real Cornell inbox. That send will also show whether Cornell's mail system opens links on delivery.
- ~~**A real Claude extraction**~~: done 2026-10-14; see [`PROMPT_TUNING.md`](./PROMPT_TUNING.md).
- **Phase 0:** nothing exists yet (no form, ideas, matches or gate result). Plan and owner decisions in [`plans/phase0.md`](./plans/phase0.md).
- **Follow-ups from `docs/security.md`:** the admin search filter, and the per-IP limit on a shared campus network.

### Incidents

CI failed on two commits; every other ticket commit passed, or its run was cancelled because the next push replaced it and that one passed.

- **P1-07 (`9002644`):** a type error in a test file, pushed because a local check step was chained with `;` instead of `&&`. Fixed in the next commit (`5289d7a`). All later pushes went through one script that stops at the first failure.
- **P1-12 (`1afcee1`):** `pnpm install --frozen-lockfile` broke because pinning the new React Email versions also stripped the `^` from the existing `@anthropic-ai/sdk` range. Fixed in `c6ba88d`; the pre-push checks now include a frozen install.

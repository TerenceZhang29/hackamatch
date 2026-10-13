# HackaMatch — Progress

Ticket status and the decisions made while building. Specs live in [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md); update this file whenever a ticket changes state.

Last updated: 2026-10-13

## Phase 1 — MVP

| Ticket | Status | Notes |
| --- | --- | --- |
| P1-01 Project scaffold | Done | Commit `0846317` |
| P1-02 Database schema and Supabase setup | Done | Commit `b78202c` |
| P1-03 Magic-link auth restricted to Cornell | Done | Token-hash link with a confirm button (see below) |
| P1-04 LLM wrapper, prompts, and taxonomy | Done, not yet run against Claude | Tested with the fake provider and a mocked SDK only (see below) |
| P1-05 Embeddings wrapper | Done, not yet run against Voyage | Tested with the fake embedder and a mocked `fetch` only (see below) |
| P1-06 Onboarding flow | Not started | Unblocked. A placeholder `/onboarding` page exists |
| P1-07 GitHub and LinkedIn import | Not started | Unblocked |
| P1-08 Profile page and settings | Not started | |
| P1-09 Post an idea | Not started | |
| P1-10 Public board | Not started | |
| P1-11 Interested / Pass from the board | Not started | A placeholder `/matches` page exists |
| P1-12 Notifications foundation | Not started | Unblocked |
| P1-13 Shared pair page and "We teamed up" | Not started | |
| P1-14 Admin tools | Not started | Needs P1-03 |
| P1-15 Analytics events | Partly done | `track`, the event-name union and its unit test landed with P1-03. Remaining: `scripts/check-analytics.ts` and the CI check |
| P1-16 Phase 0 import and seeding | Not started | No `data/phase0/` files in the repo yet |
| P1-17 Event pages and tagging | Not started | |
| P1-18 Security and privacy hardening | Not started | |
| P1-19 E2E suite and accessibility pass | Not started | |
| P1-20 Production deploy and pilot readiness | Not started | Must install the two auth email templates and the `/auth/confirm**` redirect pattern on the hosted Supabase project |

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

No paid API call has been made. The Claude path is covered by unit tests against a mocked SDK client, and the Voyage path by unit tests against a mocked `fetch`. Before the pilot, run one real extraction and one real embedding (needs `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY` and the owner's approval of the cost, which is a fraction of a cent) and read the output for prompt quality.

### Choices that differ from the plan

- **JSON schema comes from zod itself.** The plan named `zod-to-json-schema`; the project is on zod 4, which has `z.toJSONSchema` built in, so no extra dependency was added.
- **Extra files.** `src/lib/llm/types.ts` and `src/lib/embeddings/types.ts` hold the shared interface and error class, so the fake providers do not import the real ones.
- **`timeoutMs` is one deadline for the whole call,** including the validation retry, so onboarding's 8 s budget (P1-06) cannot be doubled by a retry.
- **A refusal is not retried;** a response with no tool call is retried once with the same request.
- **Embedding text leaves out empty sections** rather than emitting bare labels.
- **`embedProfile` takes the GitHub summary as an optional argument.** The schema has no column for it, so only the onboarding call that has just imported it can include it; a later re-embed will not. Decide in P1-07 whether to store it.

### Things the next tickets should know

- The forced tool call works on the Haiku family (the `LLM_MODEL_FAST` default). Current Opus and Sonnet models reject a forced `tool_choice`, so changing `LLM_MODEL_FAST` to one of them needs a change in `src/lib/llm/client.ts`.
- The fake LLM answers only the tools `record_profile` and `record_idea`. P2-04 (reason lines) must add a rule to `src/lib/llm/fake.ts`.
- The taxonomy has 167 slugs (48 skills, 77 stack, 42 domains). Slugs are stored in the database, so renaming one needs a data migration.


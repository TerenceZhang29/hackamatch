# Phase 0 plan: validate demand

**Status: planned 2026-10-14, not started.** Nothing from Phase 0 exists yet: no sign-up form, no seed ideas, no matching sheet, no emails sent, no gate result. Nothing in this plan has been implemented.

Spec: [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) §5 (P0-01 to P0-05). Phase 0 is run by a person, not code. Its purpose is to show that Cornell students want this before relying on the product: the gate is **at least 40 sign-ups and at least 5 teams**.

## The situation has changed since the plan was written

The plan put Phase 0 (about two weeks, manual) before Phase 1 (the app). Phase 1 is now built except the deploy (P1-20), and the app already supports the Phase 0 loop: admins can hand-make matches with a reason line and a one-click Interested / Pass email (P1-14). So there are three ways to proceed.

| Option | What happens | For | Against |
| --- | --- | --- | --- |
| **A. Run Phase 0 as planned** | Google Form, spreadsheet, hand-written emails for about two weeks; then import into the app with `pnpm import:phase0` | Can start before the deploy; tests demand with no product risk | Manual work every evening; emails sent by hand; an import step, with its own risks (below) |
| **B. Skip Phase 0** | Go straight to the pilot on the deployed app | Least work | No demand check before launch; the board starts empty unless seeded |
| **C. Run Phase 0 inside the app** (recommended) | Deploy first (P1-20), then recruit students into the app and hand-match them in `/admin/matches` for the same two weeks; the gate is checked with the same numbers | Same validation as A; no form, no spreadsheet, no import; students see the real product; matches, answers and teams are recorded automatically | Waits for P1-20; a bug or a bad first impression is seen by real students |

**Recommendation: option C**, unless the deploy will take long enough that waiting for it costs the pilot date. Then option A, starting now.

## Decisions for the owner

1. Which option: A, B or C?
2. The pilot event's name and date (an open question in `IMPLEMENTATION_PLAN.md` §12). Phase 0 needs about two weeks before it.
3. Who runs the evening matching, and for how many evenings?
4. Where to recruit: Cornell Tech Slack or email lists, class groups, hackathon organizers.

## Option C: steps

1. **Finish P1-20** ([`p1-20-deploy.md`](./p1-20-deploy.md)), including the Resend upgrade question: recruiting puts many sign-in emails on the first day.
2. **Seed ideas (P0-02).** The founder writes 15 to 20 ideas through `/ideas/new`, then features them in `/admin/ideas`, so the board is not empty on day one.
3. **Create the pilot event** in `/admin/events` and share its link (`/e/<slug>`); joining through it tags the event.
4. **Recruit.** One message with the event link. Target: 40 or more people in the pool.
5. **Match every evening (P0-03).** In `/admin/matches`, pick 3 to 5 pairs per active person with a one-line reason; the app sends each person the intro email with one-click Interested / Pass, and reveals contact details on mutual interest.
6. **Gate check (P0-05).** After about two weeks: count onboarded users and teams. Gate passed at 40 or more sign-ups and 5 or more teams. The query belongs in `docs/runbooks/metrics.sql` (planned in P1-20 Phase A).
7. **Record results** in `docs/runbooks/phase0-results.md`: the counts, what people said about vague ideas, and the builder / idea balance. Feed what was learned into the prompt backlog in [`PROMPT_TUNING.md`](../PROMPT_TUNING.md).

Costs: no tools beyond P1-20. Each sign-up uses about one Claude extraction and one Voyage embedding, about $0.0004 per person, so about $0.02 for 40 people.

## Option A: steps

1. **Sign-up form (P0-01).** A Google Form with exactly the fields in `IMPLEMENTATION_PLAN.md` § P0-01, so the export matches the importer. Add one line telling students their answers will be moved into HackaMatch when it launches: the import creates accounts for them, so they should know.
2. **Seed ideas (P0-02):** 15 to 20 founder-written ideas in `seed_ideas.csv`.
3. **Matching sheet (P0-03):** a Google Sheet with the header in § P0-03, filled every evening.
4. **Curated email (P0-04):** write the template in `docs/runbooks/phase0-email.md` (it does not exist yet); send from the founder's own email, by hand.
5. **Gate check (P0-05):** count sign-ups and `teamed_up = yes` rows; record in `docs/runbooks/phase0-results.md`.
6. **Import into the app** after P1-20, following [`runbooks/import-phase0.md`](../runbooks/import-phase0.md), with these changes:
   - **Use a separate env file for production** (for example `.env.production.local`, git-ignored), not `.env.local`. The runbook currently says to put production credentials in `.env.local`, which makes every local command, including `pnpm db:reset` and `pnpm seed:dev`, one slip away from production.
   - **Dry run first** and read every line it prints; create any unknown events in `/admin/events`, since the sheets have no dates.
   - **The import calls Claude and Voyage** for every person, about $0.0004 each; it needs the owner's approval like the other live calls.
   - **Welcome emails** (`--send-welcome`) go through Supabase's sign-in email, so they need P1-20's Resend setup first. On Resend's free plan the 100-a-day cap would stop a batch of more than 100 partway; the script sends one per second and does not resume by itself.

Costs: Google Forms and Sheets are free; the import is about $0.0004 per person.

## What can be prepared in the repository before Phase 0 starts (free, on request)

- `docs/runbooks/phase0-email.md` (option A only): the curated email and the intro email, from § P0-04.
- `docs/runbooks/phase0-results.md`: a template for the gate check and findings.
- The gate query in `docs/runbooks/metrics.sql` (shared with P1-20 Phase A).
- For option A: the runbook change to use a separate production env file.

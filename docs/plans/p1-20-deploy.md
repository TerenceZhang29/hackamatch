# P1-20 plan: production deploy and pilot readiness

**Status: Phase A done 2026-10-14; phases B to D not started.** Phase C waits for the owner's answers to the decisions below. The step-by-step checklist is [`runbooks/deploy.md`](../runbooks/deploy.md).

Spec: [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) § P1-20. Acceptance criteria:

- A real `@cornell.edu` address completes onboarding on production.
- Magic-link and mutual emails land in a Cornell Outlook inbox, not spam.

## Costs and decisions for the owner

Prices from each service's pricing page on 2026-10-14, except the domain, which is an unchecked estimate. Check again before buying.

| Service | Free option | Catch | Paid option |
| --- | --- | --- | --- |
| Domain (needed to send email) | None, unless the owner already has one; a subdomain such as `match.example.com` works | Email cannot be authenticated without one | About $10–20 a year (estimate, not checked) |
| Supabase (database, sign-in) | Free: 2 active projects, 500 MB each, 50,000 monthly active users | Free projects pause after 1 week of inactivity, a risk between pilot events | Pro, from $25 a month: no pausing |
| Vercel (hosting) | Hobby, $0 | For "personal, non-commercial use"; a student pilot probably fits | Pro, $20 a month per developer seat |
| Resend (email) | Free: 3,000 a month, 100 a day, 3 domains | A launch day with 100 sign-ups uses the 100-a-day cap on sign-in emails alone | Pro, $20 a month: 50,000 a month, no daily cap |
| Claude and Voyage | n/a | Usage only | About $0.30 for a 300-student pilot (measured per-call cost in [`PROMPT_TUNING.md`](../PROMPT_TUNING.md)) |

**Supabase's built-in email cannot run the pilot.** Per Supabase's docs, it sends only to addresses on the project's team and only 2 messages an hour, and the limit can change without notice. Sign-in emails must go through Resend as custom SMTP. With custom SMTP, Supabase's own limit starts at 30 emails an hour and is raised under Authentication → Rate Limits. That limit is separate from the app's own limits in `src/lib/rate-limit.ts`.

**Recommendation:** free tiers while building and testing; Resend Pro for the pilot month, and Supabase Pro if pausing between events is a risk. Up to $45 a month while the pilot runs, plus a domain if one is needed.

### Questions to answer before Phase C

1. **Domain:** does the owner already have one to use, or does one need buying?
2. **Supabase:** Free or Pro for the pilot?
3. **Resend:** start on Free and upgrade before launch day, or Pro from the start?
4. **Preview deployments:** a second Supabase project for them now, or no previews at first?
5. **Pilot event:** name and date (an open question in `IMPLEMENTATION_PLAN.md` §12; it sets the deadline).

## Phase A: preparation in the repository (free) — done 2026-10-14

Delivered: [`runbooks/deploy.md`](../runbooks/deploy.md) (phases C and D as a checklist, the production environment table, admin SQL, rollback and emergency stops), [`vercel.json`](../../vercel.json), and [`runbooks/metrics.sql`](../runbooks/metrics.sql) (Phase 1 gate, Phase 0 gate, funnel, matches, pool balance; all run against the local database).

No accounts, no resources, no charges.

1. `docs/runbooks/deploy.md`: every step in phases C and D as a checklist, with rollback steps and the SQL to make someone an admin.
2. `vercel.json`: a minimal config that places functions in the same US East region as the database. Phase 1 has no cron routes, so no cron schedule yet (P2-05 adds them).
3. `docs/runbooks/metrics.sql`: the Phase 1 gate query, 10 or more `teams` rows at the pilot event.
4. Production environment checklist: every variable in `IMPLEMENTATION_PLAN.md` §9 with its production value: real providers (`LLM_PROVIDER=anthropic`, `EMBEDDINGS_PROVIDER=voyage`, `EMAIL_PROVIDER=resend`), generated `RESPONSE_TOKEN_SECRET` and `CRON_SECRET`, `APP_URL`, `EMAIL_FROM`.

## Phase B: accounts (the owner)

- Supabase, Vercel and Resend accounts, and the domain.
- DNS records from Resend for the sending domain: SPF, DKIM and DMARC. These are what keep the emails out of spam.

## Phase C: setup (each step that creates a resource needs the owner's approval)

1. **Supabase production project** in US East (close to Cornell):
   - Push all migrations (`supabase db push` after `supabase link`); pgvector is enabled by the first migration.
   - Auth: site URL = `APP_URL`; redirect allow-list `${APP_URL}/auth/confirm**` (see P1-03; without it the emailed link breaks).
   - Install the two templates from `supabase/templates/`: Magic Link and Confirm signup.
   - Custom SMTP through Resend, so sign-in emails come from the app's domain; raise the Auth email rate limit from 30 an hour.
2. **Resend:** verify the domain; create the API key for `RESEND_API_KEY` and the SMTP credentials for Supabase.
3. **Vercel:** link the GitHub repository, set the environment variables from Phase A, deploy `main`.
4. **Preview deployments:** point at a second free Supabase project so preview builds never touch real data, or turn previews off at first (owner's decision 4).

## Phase D: verification against the acceptance criteria

1. Sign in on production with a real `@cornell.edu` address; check the email lands in Outlook's inbox, not spam.
2. From Supabase's auth logs, check whether Cornell's mail system opened the link on delivery, before the person did (open since P1-03; the confirm button already protects against it either way).
3. Check the first-time user's email template (Confirm signup), which local Supabase cannot exercise (open since P1-03).
4. Two real accounts complete the full journey: onboarding, Interested, the mutual email, and "We teamed up".
5. Make the owner an admin (SQL in the runbook) and create the pilot event in `/admin/events`.

## Phase E: Phase 0 import

Covered by the separate Phase 0 plan (`pnpm import:phase0`, [`runbooks/import-phase0.md`](../runbooks/import-phase0.md)).

# Runbook: deploy HackaMatch to production

The checklist for P1-20. The plan, costs and the owner's decisions are in [`../plans/p1-20-deploy.md`](../plans/p1-20-deploy.md); this file is the how-to. Work top to bottom and tick each box. Steps marked **(cost)** create a paid or billable resource and need the owner's approval first.

Placeholders used below:

- `<domain>`: the app's address. For now Vercel's `<project>.vercel.app` (owner's decision 2026-10-14; see [`../plans/domain-options.md`](../plans/domain-options.md)), later a bought domain such as `match.example.com`. `APP_URL` is `https://<domain>`, with no trailing slash.
- `<mail-domain>`: the domain email is sent from; usually the same as `<domain>`. It cannot be `vercel.app`: until a domain is bought, section 1 stops at the test sender, which reaches only the Resend account's own address.
- `<project-ref>`: the Supabase project id, from its dashboard URL.

## 0. Before you start

- [ ] The owner's decisions in the plan are answered: domain, Supabase plan, Resend plan, preview deployments, pilot event.
- [ ] CI is green on the `main` commit you are deploying (README badge).
- [ ] You have a password manager entry ready for the secrets below. None of them go in the repository, in chat or in `.env.local`.

## 1. Email domain (Resend)

1. [ ] Create the Resend account. **(cost: only if on Pro)**
2. [ ] Add `<mail-domain>` in Resend → Domains. Add every DNS record it shows (SPF and DKIM) at your DNS provider.
3. [ ] Add a DMARC record at your DNS provider: name `_dmarc.<mail-domain>`, type `TXT`, value `v=DMARC1; p=none; rua=mailto:<your address>`. Start with `p=none` so nothing is rejected while you check the reports.
4. [ ] Wait until Resend shows the domain as verified.
5. [ ] Create an API key with sending access, restricted to `<mail-domain>`. It is used twice: as `RESEND_API_KEY` in Vercel, and as the SMTP password in Supabase (step 2.5).
6. [ ] Choose the sender, for example `HackaMatch <hello@<mail-domain>>`. This is `EMAIL_FROM`.

## 2. Database and sign-in (Supabase)

1. [ ] Create the production project **(cost: only if on Pro)**. Region: East US (North Virginia), next to Vercel's `iad1` region set in `vercel.json`. Save the database password in the password manager.
2. [ ] Link the CLI and check what will be applied:

   ```bash
   pnpm exec supabase link --project-ref <project-ref>
   pnpm exec supabase db push --dry-run
   ```

   The dry run should list every file in `supabase/migrations/`.

3. [ ] Apply the migrations, then confirm the local and remote columns match:

   ```bash
   pnpm exec supabase db push
   pnpm exec supabase migration list
   ```

   `db push` does not run `supabase/seed.sql`; production starts empty, as it should. pgvector and citext are enabled by the first migration, and the `app_settings` row (allowed domains `{cornell.edu}`) is created by it too.

4. [ ] Authentication → URL Configuration:
   - Site URL: `https://<domain>`
   - Redirect URLs: add `https://<domain>/auth/confirm**`. Without it Supabase replaces the link with the site URL and every sign-in link breaks (see P1-03 in `PROGRESS.md`).
5. [ ] Authentication → SMTP Settings: enable custom SMTP.
   - Host `smtp.resend.com`, port `465` (implicit TLS), username `resend`, password: the Resend API key from step 1.5 (per Resend's SMTP docs, checked 2026-10-14).
   - Sender email and name: from `EMAIL_FROM`.
   - Supabase's built-in email only sends to the project's team members, 2 an hour, so no student can sign in until this is done.
6. [ ] Authentication → Rate Limits: raise "emails sent per hour" from 30. Pick it from the expected peak, for example 300 for a launch-day burst. The app's own limits still apply (5 per address and `LOGIN_RATE_LIMIT_PER_IP` per IP, per hour).
7. [ ] Authentication → Email Templates, copied from the repository:
   - Magic Link: subject `Your HackaMatch sign-in link`, body from `supabase/templates/magic_link.html`.
   - Confirm signup: subject `Welcome to HackaMatch: confirm your email`, body from `supabase/templates/confirmation.html`.
   - Both links must keep the form `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`.
8. [ ] Authentication → Providers → Email: enabled. Leave "Confirm email" on (the hosted default); the Confirm signup template above is what first-time users receive. Email OTP expiry: 3600 seconds, which the templates promise ("expires in an hour").
9. [ ] Project Settings → API: note the project URL, the anon (or publishable) key and the service_role (or secret) key, for step 3. The service key bypasses all row-level security: Vercel only, never anywhere else.

## 3. Hosting (Vercel)

1. [ ] Create the Vercel project from the GitHub repository **(cost: only if on Pro)**. Framework, install command and region come from `vercel.json`.
2. [ ] Settings → Environment Variables, scope **Production** only. Every variable below; the app refuses to start if a required one is missing (`src/lib/config.ts`, checked at boot by `src/instrumentation.ts`).

   | Variable | Production value | Required |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from step 2.9 | Yes |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon (publishable) key | Yes |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role (secret) key | Yes |
   | `APP_URL` | `https://<domain>` | Yes |
   | `APP_TIMEZONE` | `America/New_York` | No (default) |
   | `ALLOWED_EMAIL_DOMAINS` | `cornell.edu` | No (UI hint; the database is authoritative) |
   | `LLM_PROVIDER` | `anthropic` | No (production default) |
   | `ANTHROPIC_API_KEY` | A production key, separate from the development one | Yes |
   | `LLM_MODEL_FAST` | `claude-haiku-5-5` | No (default) |
   | `EMBEDDINGS_PROVIDER` | `voyage` | No (production default) |
   | `VOYAGE_API_KEY` | A production key | Yes |
   | `EMBEDDING_MODEL` | `voyage-4-lite` | No (default) |
   | `EMBEDDING_DIM` | `1024` | No (default; changing it needs a migration) |
   | `EMAIL_PROVIDER` | `resend` | No (production default) |
   | `RESEND_API_KEY` | From step 1.5 | Yes |
   | `EMAIL_FROM` | From step 1.6 | Yes |
   | `RESPONSE_TOKEN_SECRET` | `openssl rand -hex 32`; signs one-click email links | Yes |
   | `CRON_SECRET` | `openssl rand -hex 32`; no cron routes until Phase 2 | Yes |
   | `LOGIN_RATE_LIMIT_PER_IP` | `20`; raise if a shared campus IP causes refusals | No (default) |
   | `GITHUB_TOKEN` | Optional; raises GitHub's rate limit for imports | No |
   | `SHOW_EXISTING_TEAMS` | `false` | No (default) |

   - `NEXT_PUBLIC_*` values are built into the pages: changing one needs a redeploy.
   - Changing `RESPONSE_TOKEN_SECRET` breaks every one-click link already emailed. Set it once.
   - Do not set `GEMINI_*` unless switching provider; Gemini has not been tested on the current prompt.

3. [ ] Preview deployments, per the owner's decision:
   - **No previews at first** (the owner's decision, 2026-10-14): `vercel.json` sets `git.deploymentEnabled` to `false` for every branch except `main`, so a branch push or pull request never builds. Nothing to change in the dashboard. Also scope every variable to **Production** only, so a manual preview deploy would fail at boot instead of running against production.
   - **With previews:** a second Supabase project with steps 2.2 to 2.9 repeated, and its own values under the **Preview** scope only. Preview builds also run with `NODE_ENV=production`, so they use real providers unless `LLM_PROVIDER`, `EMBEDDINGS_PROVIDER` and `EMAIL_PROVIDER` are set otherwise for Preview.
4. [ ] Settings → Domains: skip while on `vercel.app`. With a bought domain, add `<domain>` and the DNS record Vercel shows.
5. [ ] Deploy `main` (Deployments → Redeploy, or push to `main`). Watch the build log; a missing variable fails at boot with a list of what is missing.

## 4. Verify (the P1-20 acceptance criteria)

1. [ ] Open `https://<domain>`: the board loads, logged out, with no errors in the browser console (the Content-Security-Policy is strict, so a blocked request shows there).
2. [ ] Sign in with a real `@cornell.edu` address. The email arrives in the Outlook **inbox, not junk**, from `EMAIL_FROM`. A first-time address gets the Confirm signup template; a returning one gets Magic Link.
3. [ ] Press the link's button and complete onboarding. Tags appear within a few seconds (Claude), and the profile is in the pool.
4. [x] Mail scanners: in Vercel → Logs, check whether `GET /auth/confirm` ran before you opened the link (open question since P1-03). The confirm button makes sign-in work either way; record what you see in `PROGRESS.md`. Checked 2026-10-17: one GET, the owner's own. Check again after the domain switch.
5. [ ] Full journey with a second real account: Interested from the board, the "interested" email, Interested back, the mutual email with contact details, the pair page, "We teamed up". Both emails must land in the inbox.
6. [ ] Make the owner an admin (section 5), open `/admin`, and create the pilot event in `/admin/events`.
7. [ ] Run query 1 in `metrics.sql` with the event's slug; it should show 1 team from step 5.
8. [ ] Record the date, the deployed commit and what was checked in `PROGRESS.md` (P1-20 row).

## Read-only checks against production

`scripts/prod-read.sh` runs one `select` against the linked project inside a read-only transaction, so Postgres refuses any write. It also prints migration status (`--migrations`) and generated types (`--types`). It needs `supabase login` and `supabase link` first. Anything that writes to production goes through the owner, not this script.

## 5. Make someone an admin

The person must have signed in once, which creates their `users` row. Then, in the Supabase SQL editor:

```sql
update public.users
set is_admin = true
where cornell_email = 'netid@cornell.edu'
returning id, cornell_email, is_admin;
```

To remove: the same with `false`. Users cannot change this themselves: `is_admin` is outside their column grant.

## 6. Rollback and emergency stops

- **Bad deploy:** Vercel → project overview → Instant Rollback. Takes effect in seconds, with no rebuild. On Hobby it can only go back to the immediately previous production deployment; Pro can pick any earlier one. A rollback keeps the old build's environment variables, and it stops new pushes to `main` from going live until you press Undo Rollback (or `vercel promote`) once the fix is deployed.
- **Bad migration:** migrations are forward-only. Never edit or delete an applied one. Write a new migration that reverses the change, test it locally with `pnpm db:reset && pnpm test:db`, then `db push`. Before pushing any migration to production, take a backup:

  ```bash
  pnpm exec supabase db dump --linked -f backup-schema.sql
  pnpm exec supabase db dump --linked --data-only -f backup-data.sql
  ```

  Keep these files out of the repository: the data dump holds student emails. Check what automatic backups the Supabase plan includes before relying on them.

- **Stop new sign-ins at once** (abuse, an email problem): in the SQL editor,

  ```sql
  update public.app_settings set allowed_email_domains = '{}';
  ```

  The login form then refuses every address before sending email, and the database refuses new accounts. People already signed in keep working. Undo with `'{cornell.edu}'`.

- **Stop all email:** revoke the Resend API key in Resend. Sign-in emails stop too, since Supabase sends through it.
- **A leaked secret:** rotate it at its source (Supabase, Resend, Anthropic, Voyage), update Vercel, redeploy. Rotating `RESPONSE_TOKEN_SECRET` invalidates links already emailed.

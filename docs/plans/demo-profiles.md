# Plan: demo profiles for a production pilot

Requested by the owner on 2026-10-20. Status: **built and tested locally (2026-10-20); production writes need the owner's approval.**

## The ask
Run a pilot test in production without testers seeing an empty site, and without any real-world disturbance. **No email goes to anyone because of the demo**, including fake addresses.

## Approach
Hand-written **demo profiles** live in production next to real users. They're tagged `is_demo`, can't receive or trigger email, are labeled "Demo" in the app, are left out of metrics, and can be hidden or deleted at once.

### Addresses that can never receive mail
- Each demo person's address is `demo-NNN@hackamatch.invalid` (`.invalid` is reserved by RFC 2606 and never resolves). It is stored **only in `public.users`**.
- **`auth.users.email` is null for demo accounts.** Tested locally: Supabase Auth still emails a *banned* account that has an address. With no email, a sign-in request for a demo address finds no account, then tries to create one, and `enforce_email_domain` refuses it. So nothing is sent (checked with Mailpit).
- `enforce_email_domain` accepts the demo domain only when the session setting `hackamatch.demo_seed` is `on`. Only the demo seed sets it, inside its own transaction; sign-ups through Supabase Auth can't. `handle_new_auth_user` takes the address from the metadata (`demo_email`) only under the same setting.
- Accounts are also banned until 9999. Every `auth.users` column Supabase Auth reads is filled (tokens `''`, timestamps), so the dashboard's user list still works. Leaving them null breaks Auth's lookups.
- `notify_channel = 'none'` on every demo user is one more guard.

### No email because of the demo
`send()` (`src/server/notify.ts`) is the only way the app emails anyone. It now:
1. **refuses** any recipient who is `is_demo`, or whose address is outside `app_settings.allowed_email_domains`. It logs the attempt in `notification_log` as `skipped` with `reason: "demo"` or `"domain"`.
2. `sendMutualEmails` and `sendInboundInterest` (`src/server/matches.ts`) stop before doing anything when **either** person in the match is a demo profile. So the real tester gets no email either, and no Claude call is made for the suggested message.

Testers still get their own sign-in emails, which is how a real student signs in.

### Demo profiles answer Interested
When a tester says Interested to a demo profile, from Discover, the board or a person page, the demo profile answers Interested at once. The match is revealed in the app (the "You matched" screen, then the pair page), so testers can try the whole flow. Because of the rule above, nobody is emailed. The pair page labels the person as a demo profile.

### Labeled, counted apart, easy to remove
- A **Demo** chip appears on demo person and idea cards (Discover, the board, event pages, `/people`, `/ideas`) and on the pair page.
- **Metrics:** `docs/runbooks/metrics.sql` and the `/admin` counts leave out demo users and what they own. `/admin/users` labels them.
- **`app_settings.show_demo`** (default `true`): when it's `false`, the board functions (`public_board_ideas`, `public_board_people`, `public_person`, `public_idea`) leave out demo users and their ideas at once, without a deploy.
- **Removal:** `supabase/demo/remove.sql` deletes `auth.users` where the email ends in `@hackamatch.invalid`. Profiles, ideas, interests, matches and teams cascade.

## Data
- `scripts/demo-data.ts` holds about 30 people and about 18 ideas, written by hand: names, role, intents, summary, skills, stack, areas, and idea pitches with tags. There are **no AI calls** (no extraction, no embeddings), so it costs $0.
- `pnpm demo:sql` turns that into `supabase/demo/seed.sql`, **one `do` block**: `supabase db query -f` can't take several commands, and one statement runs atomically. It's idempotent (`on conflict do nothing`), and it tags each demo person with up to two upcoming events that exist when it runs. Re-run it after creating the pilot event to tag them with it.
- **Locally:** `pnpm demo:seed:local` applies the SQL to the local database.
- **Production:** `pnpm exec supabase db query --linked -f supabase/demo/seed.sql`. This is a write, so it runs **only with the owner's approval**. It's checked afterwards with `scripts/prod-read.sh`.

## Production steps (each one needs the owner's approval)
1. **Migration first:** `pnpm exec supabase db push`. The code reads `users.is_demo`, so the column must exist before the code deploys. The current code keeps working with it.
2. **Commit and push** the code. Vercel deploys.
3. **Seed:** `pnpm demo:sql`, then `pnpm exec supabase db query --linked -f supabase/demo/seed.sql`.
4. **Check** with `scripts/prod-read.sh`:
   - 30 demo users;
   - all with `notify_channel = 'none'`;
   - none with an email in `auth.users`;
   - 18 demo ideas;
   - `notification_log` unchanged.
5. **Later:**
   - to hide everything without removing it: `update public.app_settings set show_demo = false`;
   - to remove it all: `pnpm exec supabase db query --linked -f supabase/demo/remove.sql`.
   - Both are production writes, so ask first.

## Migration (`20261020000000_demo_profiles.sql`)
- `users.is_demo boolean not null default false`.
- `app_settings.show_demo boolean not null default true`.
- The four board functions are re-created with the same signatures, plus the `show_demo` filter. `create or replace` keeps their server-only grants.
- `enforce_email_domain` and `handle_new_auth_user` accept the demo domain only inside the seed (see above).
- `active_pool` leaves out demo users, for the metrics and for Phase 2's matching later.

## Tests
- **Unit:** the seed SQL generator only uses `@hackamatch.invalid` addresses, and every person sets `is_demo` and `notify_channel = 'none'`.
- **Database:**
  - `show_demo = false` hides demo people and ideas from all four functions;
  - `is_demo` defaults to false.
- **E2E (local, with the demo SQL applied):**
  - a Demo chip on the cards;
  - Interested on a demo person reveals the match immediately, and **no** email reaches the outbox for either person;
  - `send()` to a demo user is logged as skipped.

## Order
1. The migration, the `send()` guard, and the match-email stop.
2. Auto-Interested, plus the Demo chips and labels.
3. The demo data, the SQL generator, local seeding, and metrics and admin exclusions.
4. Tests, then ask the owner to approve the migration and the seed on production.

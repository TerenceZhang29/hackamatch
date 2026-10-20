# Plan: a sign-up gate for the production pilot

Requested by the owner on 2026-10-20. Status: **built and tested locally; the production migration needs the owner's approval.** Temporary: turn it off, or remove it, when the pilot opens to everyone.

## The ask
During the pilot, only invited students can create an account. Anyone else sees "No access for the pilot test. Please contact the admin."

## How it works
- **The switch:** `app_settings.pilot_only` (default off). Turned on and off in **`/admin/pilot`**.
- **The list:** `public.pilot_access`, one row per netID, stored lowercase. Admins paste netIDs or Cornell emails into `/admin/pilot`, separated by spaces, commas or new lines, and remove them one by one. The page shows who has signed up.
- **Who gets in while it's on:**
  - a netID on the list;
  - **anyone who already has an account**, listed or not, so the owner, existing testers and demo profiles are unaffected. To stop an existing account, pause it in `/admin/users`.
- **Two checks:**
  1. **The login form** (`src/app/(focus)/login/actions.ts`) asks `pilot_can_sign_in(email)` after the domain check and the rate limit, and shows the message **before any email is sent**.
  2. **The database** (`enforce_pilot_access`, a trigger before insert on `public.users`) refuses an unlisted new account. Supabase Auth creates that row in the same transaction, so the sign-up fails even if someone calls the Supabase API directly with the public key. If the form's check fails with a database error, it lets the request through and this trigger still decides.
- **Private:** the list and the check function are server-only (no grants to `anon` or `authenticated`), so nobody can read the list or probe it through the API. The form's answer could reveal whether a netID is invited, but only at the login rate limit.
- **The demo seed** is exempt (it runs with `hackamatch.demo_seed` on).

## Production steps (each needs the owner's approval)
1. `pnpm exec supabase db push` (migration `20261021000000_pilot_access.sql`). The gate starts **off**, so nothing changes yet.
2. Commit and push; Vercel deploys.
3. In `/admin/pilot`: add the testers' netIDs, then **Turn the gate on**. Check with a netID that isn't listed: the message appears and no email arrives.

## Removing it later
**Quick:** turn the gate off in `/admin/pilot`. Sign-ups open to every Cornell address at once, with no deploy.

**Fully** (planned with the production wipe after the pilot). Order matters: code first, then the database.
1. **Code (one commit):**
   - delete `src/app/admin/pilot/`, `src/lib/pilot.ts`, `src/server/pilot.ts`;
   - in `src/app/(focus)/login/actions.ts`, remove the `pilotCanSignIn` check and its two imports;
   - in `src/app/admin/actions.ts`, remove `togglePilotOnly`, `addPilotAccess`, `removePilotAccess` and their imports; in `src/app/admin/ui.tsx`, the "Pilot access" link;
   - delete `tests/unit/pilot.test.ts`, `tests/db/pilot-access.test.ts`, `tests/e2e/pilot.spec.ts`; remove `/admin/pilot` from `tests/e2e/admin.spec.ts` and the `pilot` project and `testIgnore` lines from `playwright.config.ts`.
2. **A migration** (deploy the code first, since the old code calls the function):
   ```sql
   drop trigger users_enforce_pilot_access on public.users;
   drop function public.enforce_pilot_access();
   drop function public.pilot_can_sign_in(text);
   drop table public.pilot_access;
   alter table public.app_settings drop column pilot_only;
   ```
   Then `pnpm db:types`.
3. Nothing else depends on it: no other table, view or function refers to the gate.

## Tests
- **Unit:** `parseNetIds` (separators, emails, case, bad entries).
- **Database:** off by default; on refuses unlisted sign-ups; listed netIDs in any case get in; existing accounts still pass; demo seed exempt; list and function are server-only.
- **E2E** (`tests/e2e/pilot.spec.ts`, its own Playwright project that runs after the others, since the switch is global): the admin page, the message with no email sent, a listed sign-up, an existing account, removing a netID.

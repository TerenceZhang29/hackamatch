# Plan: cleaning up the demo content

Written 2026-10-20. Status: **plan; nothing run.** Every step below that changes production needs the owner's approval at the time.

## Background
On 2026-10-20 production got 30 demo profiles (`users.is_demo`, `demo-NNN@hackamatch.invalid`) and 18 ideas, for the pilot on Test Hackathon (`test-hackathon`). See `docs/plans/demo-profiles.md`. They can't receive or cause email. This plan is how to take them away again.

## When
Do it in two stages:
1. **Hide** them when real students start arriving in numbers, at the latest when the real pilot event's link goes out. The board then shows only real people, and the demo profiles stay in the database in case a tester's flow needs checking.
2. **Remove** them once the pilot results are recorded (`docs/runbooks/phase0-results.md`), or after about two weeks of hiding with no reason to bring them back.

## What removal touches
`supabase/demo/remove.sql` deletes the demo accounts from `auth.users`. Everything below follows through the existing foreign keys:

| Data | What happens |
|---|---|
| Demo `users`, `profiles` | Deleted (cascade). |
| Demo `ideas` | Deleted, along with their tags. |
| `event_interests` of demo people | Deleted. The events' "N looking" counts drop. |
| `matches` with a demo person | Deleted, including testers' match with them and their pair pages. |
| `match_event_votes` on those matches | Deleted. |
| `team_members` rows for demo people | Deleted. A team a **tester** created with a demo person stays, with the tester as its only member. Demo people never create teams. |
| `notification_log` | Nothing to delete. Demo rows are only ever `skipped`, and they cascade too. |
| `analytics_events` with a demo user id | Kept, with `user_id` set to null. Demo profiles don't act, so this should be none. |
| Real users, real ideas, events, settings | Untouched. |

## Steps

### 0. Before: back up and look
- Back up first, as in `docs/runbooks/deploy.md` §6 (`supabase db dump --linked`, schema and data).
- Read the current state (read-only, `scripts/prod-read.sh`):
  ```sql
  select
    (select count(*) from public.users where is_demo) as demo_users,
    (select count(*) from public.users where not is_demo) as real_users,
    (select count(*) from public.matches m where exists (
      select 1 from public.users u where u.id in (m.user_a, m.user_b) and u.is_demo)) as demo_matches,
    (select count(*) from public.team_members tm join public.users u on u.id = tm.user_id
      where u.is_demo) as demo_team_members
  ```
- Note the numbers, to compare afterwards.

### 1. Hide (reversible, no data loss)
```sql
update public.app_settings set show_demo = false;
```
- **Effect:** demo people and ideas leave the board, Discover, event pages, `/people/<id>` and `/ideas/<id>` at once, with no deploy.
- **Undo:** `set show_demo = true`.
- **Check:** `/e/test-hackathon` no longer lists demo people, and a signed-in tester's Discover shows only real people.
- **Known gaps while hidden:**
  - a tester's existing matches with demo people still appear on their `/matches` and pair pages (with the Demo label);
  - the events' "N looking" counts still include demo people.
  Both go away in step 2. Fix them in code only if hiding lasts long enough to matter.

### 2. Remove (permanent)
1. Optionally, tell testers their demo matches are about to disappear.
2. Run:
   ```sh
   pnpm exec supabase db query --linked -f supabase/demo/remove.sql
   ```
   It's one statement: `delete from auth.users where id in (select id from public.users where is_demo)`.
3. Check (read-only):
   - `demo_users` is 0;
   - `real_users` is unchanged;
   - no `auth.users` row has `raw_user_meta_data ? 'demo_email'`;
   - no idea's owner is missing.
4. Tidy up the teams left with one member, if any (approval needed). Either:
   ```sql
   delete from public.teams t where (select count(*) from public.team_members tm where tm.team_id = t.id) < 2;
   ```
   or leave them: a one-person team does no harm.
5. Turn `show_demo` back to `true`. With no demo rows left it hides nothing, and the switch stays ready for next time.

### 3. Afterwards (code, optional)
- **Keep** `is_demo`, `show_demo`, the `send()` guard and the demo-domain rule. They're small, tested, and let a later pilot reuse the demo seed.
- **If demo content won't be used again,** a later change could remove:
  - `scripts/demo/`, `supabase/demo/` and `src/lib/demo-seed.ts`;
  - the Demo chip;
  - the demo branches in `src/server/matches.ts`.
  It would also need a migration to drop the column and the trigger exceptions. That's a separate plan, if the owner wants it.

## Verification after each stage
- `/`, `/events` and `/e/test-hackathon` load (200), with no demo cards.
- The metrics queries (`docs/runbooks/metrics.sql`) give the same real-user numbers as before. They already leave demo profiles out, so removing them changes nothing there.
- `notification_log` shows no new `sent` rows from the clean-up.

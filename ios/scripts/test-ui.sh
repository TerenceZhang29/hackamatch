#!/usr/bin/env bash
# The app end to end against the local stack (docs/plans/ios-app.md):
#   1. pnpm db:start                                     (local Supabase and Mailpit)
#   2. LOGIN_RATE_LIMIT_PER_IP=100000 pnpm dev           (the web app on :3000)
#   3. ios/scripts/test-ui.sh                            (SIMULATOR="iPhone 17" by default)
# It adds one demo profile for the run. Both it and the accounts the tests create
# (ios-<digits>@cornell.edu) are deleted afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."

psql() { docker exec -i supabase_db_hackamatch psql -U postgres -q -v ON_ERROR_STOP=1 "$@"; }

cleanup() {
  psql -c "delete from auth.users where email like 'ios-%@cornell.edu'
           or raw_user_meta_data->>'demo_email' = 'ios-demo@hackamatch.invalid'" >/dev/null
}
trap cleanup EXIT
cleanup

# A demo profile going to Health AI Buildathon: it answers Interested at once,
# so the test can make a mutual match (docs/plans/demo-profiles.md).
psql >/dev/null <<'SQL'
begin;
set local hackamatch.demo_seed = 'on';
with demo as (
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
          'authenticated', null,
          jsonb_build_object('name', 'Iris Demo', 'demo_email', 'ios-demo@hackamatch.invalid'))
  returning id
)
select id from demo \gset demo_
update public.users set is_demo = true, notify_channel = 'none', role = 'both', onboarded_at = now()
  where id = :'demo_id';
update public.profiles set skills = '{frontend}', stack = '{react}', domains = '{health}'
  where user_id = :'demo_id';
insert into public.event_interests (user_id, event_id)
  select :'demo_id', id from public.events where slug = 'health-ai-buildathon';
commit;
SQL

curl -sf -o /dev/null http://localhost:3000/api/v1/taxonomy \
  || { echo "Start the web app first: LOGIN_RATE_LIMIT_PER_IP=100000 pnpm dev" >&2; exit 1; }

xcodebuild test -project HackaMatch.xcodeproj -scheme HackaMatchUITests \
  -destination "platform=iOS Simulator,name=${SIMULATOR:-iPhone 17}" \
  -collect-test-diagnostics never CODE_SIGNING_ALLOWED=NO -quiet

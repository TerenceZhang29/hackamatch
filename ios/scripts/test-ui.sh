#!/usr/bin/env bash
# The app end to end against the local stack (docs/plans/ios-app.md):
#   1. pnpm db:start                                     (local Supabase and Mailpit)
#   2. LOGIN_RATE_LIMIT_PER_IP=100000 pnpm dev           (the web app on :3000)
#   3. ios/scripts/test-ui.sh                            (SIMULATOR="iPhone 17" by default)
# Accounts the tests create (ios-<digits>@cornell.edu) are deleted afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."

cleanup() {
  docker exec supabase_db_hackamatch psql -U postgres -q \
    -c "delete from auth.users where email like 'ios-%@cornell.edu'" >/dev/null
}
trap cleanup EXIT

curl -sf -o /dev/null http://localhost:3000/api/v1/taxonomy \
  || { echo "Start the web app first: LOGIN_RATE_LIMIT_PER_IP=100000 pnpm dev" >&2; exit 1; }

xcodebuild test -project HackaMatch.xcodeproj -scheme HackaMatchUITests \
  -destination "platform=iOS Simulator,name=${SIMULATOR:-iPhone 17}" \
  -collect-test-diagnostics never CODE_SIGNING_ALLOWED=NO -quiet

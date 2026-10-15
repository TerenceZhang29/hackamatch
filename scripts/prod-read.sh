#!/usr/bin/env bash
# Read-only access to the linked production database (see docs/runbooks/deploy.md).
#
#   scripts/prod-read.sh "select ..."    run one SQL statement, read-only
#   scripts/prod-read.sh --migrations    local vs remote migration status
#   scripts/prod-read.sh --types         generated types from production, to stdout
#
# The statement runs inside a read-only transaction, so Postgres itself refuses
# any write. Only one statement is accepted: a second one could end that
# transaction (`commit; update ...`) and run outside it.
set -euo pipefail
cd "$(dirname "$0")/.."

supabase() {
  pnpm exec supabase "$@" </dev/null 2> >(grep -v -i -e "new version" -e "recommend updating" >&2)
}

case "${1:-}" in
  --migrations)
    supabase migration list --linked
    ;;
  --types)
    supabase gen types typescript --linked
    ;;
  "" | -h | --help)
    sed -n '2,10s/^# \{0,1\}//p' "$0"
    exit 2
    ;;
  *)
    sql="$1"
    # Trim surrounding whitespace and one trailing semicolon.
    sql="$(printf '%s' "$sql" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/;$//')"
    if [[ "$sql" == *";"* ]]; then
      echo "prod-read: one statement only (no ';' inside the query)" >&2
      exit 2
    fi
    first="$(printf '%s' "$sql" | awk '{ print tolower($1); exit }')"
    case "$first" in
      select | with | explain | show | table | values) ;;
      *)
        echo "prod-read: only select, with, explain, show, table or values queries" >&2
        exit 2
        ;;
    esac
    supabase db query --linked "begin transaction read only; $sql"
    ;;
esac

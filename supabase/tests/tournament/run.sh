#!/bin/bash
#
# End-to-end test for the tournament migrations.
#
# There is no component-test infrastructure in this repo and vitest cannot reach
# plpgsql, so the pairing engine, the confirmation flow and the RLS policies are
# exercised the only way they can honestly be exercised: against a real Postgres
# with the migrations applied to it.
#
# Supabase branching needs a Pro plan, and `supabase start` needs Docker, so this
# stands up a throwaway cluster on port 55432 with its own data directory under
# $TMPDIR. It touches no existing local Postgres and no Supabase project.
#
#   ./supabase/tests/tournament/run.sh
#
# 00_shim.sql reproduces the parts of a Supabase database the migrations depend
# on — the anon/authenticated/service_role roles, auth.users, auth.uid() reading
# request.jwt.claims, Supabase's default privilege grants, and the two production
# tables the schema references. It is a stand-in, not a copy: anything that
# depends on a Supabase feature outside that list is not covered here.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/../../.." && pwd)"
PGDATA="${TMPDIR:-/tmp}/arena-test-pg"
PORT=55432
PSQL="psql -h 127.0.0.1 -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"

if ! command -v initdb >/dev/null; then
  echo "postgres is not on PATH (brew install postgresql@15)" >&2
  exit 1
fi

if ! pg_isready -h 127.0.0.1 -p $PORT >/dev/null 2>&1; then
  rm -rf "$PGDATA"
  LANG=C LC_ALL=C initdb -D "$PGDATA" -U postgres --auth=trust --locale=C >/dev/null
  LANG=C LC_ALL=C pg_ctl -D "$PGDATA" \
    -o "-p $PORT -h 127.0.0.1 -c unix_socket_directories=" \
    -l "$PGDATA/server.log" start >/dev/null
  # The socket path under $TMPDIR blows past the 103-byte limit, hence TCP only.
  sleep 2
fi

# A rebuild every run, so what is tested is the migration files rather than
# whatever the last run happened to leave behind.
$PSQL -c "DROP OWNED BY anon, authenticated, service_role;
          DROP SCHEMA IF EXISTS public CASCADE;
          DROP SCHEMA IF EXISTS auth CASCADE;
          CREATE SCHEMA public;" >/dev/null 2>&1 || \
$PSQL -c "DROP SCHEMA IF EXISTS public CASCADE;
          DROP SCHEMA IF EXISTS auth CASCADE;
          CREATE SCHEMA public;" >/dev/null

$PSQL -f "$DIR/00_shim.sql"    >/dev/null
$PSQL -f "$DIR/01_helpers.sql" >/dev/null

for m in 20260904141735_tournament_schema \
         20260904141835_tournament_registration \
         20260904141922_tournament_pairing \
         20260904142006_tournament_results \
         20260904142050_tournament_discord \
         20260904142110_activity_tournament \
         20260904142313_tournament_pin_search_path; do
  $PSQL -f "$REPO/supabase/migrations/$m.sql" >/dev/null 2>&1
done
echo "migrations applied"

# ok() raises on a failed assertion and ON_ERROR_STOP turns that into a non-zero
# exit, so a broken invariant fails the run rather than scrolling past.
fail=0
for t in 10_setup_and_guards 20_registration_and_round_one \
         30_results_and_disputes 40_rounds_ledger_and_rls 50_discord_bot \
         60_activity; do
  if ! psql -h 127.0.0.1 -p $PORT -U postgres -v ON_ERROR_STOP=1 -q -f "$DIR/$t.sql" 2>&1 \
       | grep -E "^──|ok  |FAILED|ERROR" | sed 's/^psql.*NOTICE: //'; then
    fail=1
  fi
done

echo ""
if [ "$fail" -eq 0 ]; then
  echo "PASS — stop the cluster with: pg_ctl -D $PGDATA stop"
else
  echo "FAIL"
fi
exit $fail

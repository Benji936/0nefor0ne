#!/usr/bin/env bash
# Checks TopDeck.gg decklist coverage for every Yu-Gi-Oh format over the past year.
# Reads TOPDECK_API_KEY from the frontend .env. Usage: bash scripts/topdeck/check-coverage.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KEY="$(grep '^TOPDECK_API_KEY=' "$DIR/.env" | cut -d= -f2)"

for f in Advanced Edison Goat HAT REDU Genesys Domain; do
  out="/tmp/td_${f}.json"
  curl -s -X POST https://topdeck.gg/api/v2/tournaments \
    -H "Authorization: $KEY" \
    -H 'Content-Type: application/json' \
    -d "{\"game\":\"Yu-Gi-Oh\",\"format\":\"$f\",\"last\":365,\"columns\":[\"name\",\"decklist\"]}" > "$out"
  n=$(grep -o '"TID"' "$out" | wc -l | tr -d ' ')
  d=$(grep -o '"decklist":"' "$out" | wc -l | tr -d ' ')
  echo "$f: tournaments=$n decklists=$d"
  sleep 1
done

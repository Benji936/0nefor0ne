#!/usr/bin/env bash
set -euo pipefail
HEX=$(openssl rand -hex 4)
FILE=".specs/scratchpad/${HEX}.md"
mkdir -p .specs/scratchpad
printf "# Scratchpad: %s\n\nCreated: %s\n\n---\n\n" "$HEX" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$FILE"
echo "$FILE"

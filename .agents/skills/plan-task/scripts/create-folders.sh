#!/usr/bin/env bash
set -euo pipefail
mkdir -p .specs/tasks/{draft,todo,in-progress,done} .specs/analysis .specs/scratchpad
if ! grep -qxF '.specs/scratchpad/' .gitignore 2>/dev/null; then
  echo '.specs/scratchpad/' >> .gitignore
fi
echo "Directories ready."

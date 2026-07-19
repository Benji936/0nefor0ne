#!/bin/bash
# Claude Code — Local AI (Qwen 3.5 4B (lightweight, browser-agent friendly))
CLAUDE_BIN="/Users/benjaminsitbon/.local/bin/claude"
MLX_PYTHON="/Users/benjaminsitbon/.local/mlx-server/bin/python3"
MLX_SERVER="/Users/benjaminsitbon/.local/mlx-native-server/server.py"

if ! lsof -i :4000 >/dev/null 2>&1; then
  MLX_MODEL="mlx-community/Qwen3.5-4B-4bit" "$MLX_PYTHON" "$MLX_SERVER" >/tmp/mlx-server.log 2>&1 &
  echo "  Loading Qwen 3.5 4B (lightweight, browser-agent friendly) on MLX..."
  while ! curl -s http://localhost:4000/health 2>/dev/null | grep -q "ok"; do
    sleep 2
  done
fi

clear
echo ""
echo "  → Claude Code with LOCAL AI"
echo "  → Qwen 3.5 4B (lightweight, browser-agent friendly)"
echo "  → 100% on-device, no cloud, no API fees"
echo ""

ANTHROPIC_BASE_URL=http://localhost:4000 \
ANTHROPIC_API_KEY=sk-local \
exec "$CLAUDE_BIN" --model claude-sonnet-4-6

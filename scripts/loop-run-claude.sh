#!/usr/bin/env bash
# Run each expanded prompt in order using Claude Code non-interactive mode (-p).
# One claude process per file = separate agent runs stacked back-to-back.
#
# Usage (from your project root, after loop-expand):
#   bash /path/to/loop-cursor-plugin/scripts/loop-run-claude.sh
#   bash .../loop-run-claude.sh .loop/prompts
#   bash .../loop-run-claude.sh .loop/prompts --allowedTools Read,Write,Bash
#   DRY_RUN=1 bash .../loop-run-claude.sh   # print plan only
#
# Docs: https://code.claude.com/docs/en/headless
set -euo pipefail

PROMPTS_DIR=".loop/prompts"
if [[ $# -ge 1 && -d "$1" ]]; then
  PROMPTS_DIR="$1"
  shift
fi

if [[ ! -d "$PROMPTS_DIR" ]]; then
  echo "Not a directory: $PROMPTS_DIR" >&2
  exit 1
fi

shopt -s nullglob
candidates=("$PROMPTS_DIR"/*.md)
files=()
while IFS= read -r line; do
  [[ -n "$line" ]] && files+=("$line")
done < <(printf '%s\n' "${candidates[@]}" | LC_ALL=C sort)

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No .md prompts in $PROMPTS_DIR (run loop-expand first)." >&2
  exit 1
fi

if ! command -v claude &>/dev/null; then
  echo "claude CLI not found on PATH. Install Claude Code: https://code.claude.com/docs" >&2
  exit 1
fi

n=0
for f in "${files[@]}"; do
  n=$((n + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  [$n/${#files[@]}] $(basename "$f")"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    echo "[dry-run] claude -p \"...\" $*"
    continue
  fi
  claude -p "$(cat "$f")" "$@"
done

echo ""
echo "Done. Ran ${#files[@]} prompt(s)."

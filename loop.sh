#!/usr/bin/env bash
# Loop 外循环 — 仿 Ralph scripts/ralph/ralph.sh
# Usage: ./loop.sh [--tool agent|claude|amp] [--until-stop] [max_iterations]

set -e

TOOL=""
MAX_ITERATIONS=10
WORKERS=1
UNTIL_STOP=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    --workers)
      WORKERS="$2"
      shift 2
      ;;
    --workers=*)
      WORKERS="${1#*=}"
      shift
      ;;
    --until-stop|--forever)
      UNTIL_STOP=1
      shift
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      fi
      shift
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(cd "$SCRIPT_DIR/cli" && pwd)"

if [[ -z "${LOOP_PROJECT_ROOT:-}" ]]; then
  if [[ "$SCRIPT_DIR" == *"/.cursor/skills/loop" ]]; then
    export LOOP_PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
  else
    export LOOP_PROJECT_ROOT="$SCRIPT_DIR"
  fi
fi

cd "$CLI_DIR"
if [[ "$UNTIL_STOP" -eq 1 ]]; then
  ARGS=(loop run --until-stop)
else
  ARGS=(loop run --max-iterations "$MAX_ITERATIONS")
fi
[[ -n "$TOOL" ]] && ARGS+=(--tool "$TOOL")
[[ "$WORKERS" -gt 1 ]] && ARGS+=(--workers "$WORKERS")
pnpm "${ARGS[@]}"

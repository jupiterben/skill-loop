#!/usr/bin/env bash
# Loop 快捷脚本
# 日常命令: ./loop.sh status | next | complete US-001 | dashboard | dashboard dev | help ...
# 持续循环: ./loop.sh watch [--tool agent] [--workers 3]（监听 Story，不退出的）
# 有限迭代: ./loop.sh [--tool agent|claude|codex] [max_iterations]（须显式传参）

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(cd "$SCRIPT_DIR/cli" && pwd)"
LOOP_CLI="$CLI_DIR/dist/cli.js"

require_built_cli() {
  if [[ ! -f "$LOOP_CLI" ]]; then
    echo "未找到 $LOOP_CLI，请先在 cli 目录执行: pnpm install && pnpm build" >&2
    exit 1
  fi
}

run_loop() {
  require_built_cli
  node "$LOOP_CLI" "$@"
}

resolve_project_root() {
  if [[ -z "${LOOP_PROJECT_ROOT:-}" ]]; then
    if [[ "$SCRIPT_DIR" == *"/.cursor/skills/loop" ]]; then
      export LOOP_PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
    else
      export LOOP_PROJECT_ROOT="$SCRIPT_DIR"
    fi
  fi
}

# 无参数时显示帮助
if [[ $# -eq 0 ]]; then
  resolve_project_root
  run_loop help
  exit $?
fi

# CLI 子命令（首参非 - 开头）
if [[ $# -gt 0 && "$1" != -* ]]; then
  resolve_project_root
  run_loop "$@"
  exit $?
fi

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

resolve_project_root
if [[ "$UNTIL_STOP" -eq 1 ]]; then
  ARGS=(run --until-stop)
else
  ARGS=(run --max-iterations "$MAX_ITERATIONS")
fi
[[ -n "$TOOL" ]] && ARGS+=(--tool "$TOOL")
[[ "$WORKERS" -gt 1 ]] && ARGS+=(--workers "$WORKERS")
run_loop "${ARGS[@]}"

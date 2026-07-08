#!/usr/bin/env bash
# 构建并输出精简发布包到 release/
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/release.mjs" "$@"

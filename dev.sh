#!/usr/bin/env bash
# 看板开发模式（热更新 UI :5173 + 内嵌 API）
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/loop.sh" dashboard dev

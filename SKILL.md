---
name: loop-cli
description: >-
  通过 loop-cli 管理 Loop 工程迭代状态（Skill + Shell，无需 MCP）。
  用 Shell 调用 status/next/complete/progress 等命令。
  在用户做 Agent 迭代、管理 PRD Story、查看 Loop 进度时使用。
---

# loop-cli

用 Shell 管理 Loop 迭代状态，输出 JSON。**不配置 MCP**，直接调用 CLI。

## 环境

**项目根** = 当前 Cursor 工作区根目录。**状态目录** = 项目内 `.loop/`。**CLI 目录** = `.cursor/skills/loop/cli`。

在工作区根目录执行：

```powershell
$env:LOOP_PROJECT_ROOT = (Get-Location).Path
cd .cursor/skills/loop/cli
```

直接 `pnpm loop <command>`（tsx 运行 `src/cli.ts`，无需 build）。

## 外循环（仿 Ralph）

自动多轮调用 AI，每轮实现一个 Story：

```powershell
pnpm loop run                    # 默认 agent/claude，最多 10 轮
pnpm loop run --tool agent 20    # 指定工具与轮数
pnpm loop run --tool claude --max-iterations 5
pnpm loop run --until-stop --tool agent   # 持续运行，另开终端 loop run stop 结束
pnpm loop run --workers 3 --until-stop --tool agent   # 3 个并行 worker（git worktree 隔离）
```

也可直接运行脚本（自动设置 `LOOP_PROJECT_ROOT`）：

```powershell
.\.cursor\skills\loop\cli\scripts\loop.ps1 -Tool agent -MaxIterations 10
.\.cursor\skills\loop\cli\scripts\loop.ps1 -Tool agent -UntilStop
```

提示词：`.loop/AGENT.md`（可覆盖）或 CLI 内置 `templates/AGENT.md`。

## 每轮迭代（手动）

```powershell
pnpm loop status          # 总进度
pnpm loop next            # 下一 Story
pnpm loop patterns        # Codebase Patterns

pnpm loop start-run --iteration 1 --tool cursor

# 实现代码、测试、commit 后：
pnpm loop complete US-003
pnpm loop progress --story-id US-003 --summary "实现了什么" --learning "学到的模式"
pnpm loop add-pattern "可复用约定（如有）"

pnpm loop end-run --run-id 1 --status completed
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm loop status` | 总览进度、分支、下一 Story |
| `pnpm loop next` | 下一待做 Story |
| `pnpm loop patterns` | Codebase Patterns |
| `pnpm loop prd` / `tree` | 完整 PRD / 脑图树 |
| `pnpm loop complete US-xxx` | 标记 Story 完成 |
| `pnpm loop confirm-story US-xxx` | 确认草稿 Story 可执行 |
| `pnpm loop progress --summary "..."` | 追加进度记录 |
| `pnpm loop add-pattern "..."` | 添加可复用模式 |
| `pnpm loop add-story --title "..."` | 添加 Story（默认草稿） |
| `pnpm loop add-story --title "..." --ready` | 添加并直接可执行 |
| `pnpm loop add-feature --title "..."` | 添加 Feature 分组 |
| `pnpm loop run [--tool agent] [N]` | 外循环自动迭代（仿 Ralph） |
| `pnpm loop run --workers 3` | 3 个并行 Agent（worktree + Story 认领） |
| `pnpm loop run --until-stop` | 持续外循环，直到 `loop run stop` |
| `pnpm loop run stop` / `run status` | 停止 / 查看外循环（`stop --worker w0` 停止单个 worker 请求） |
| `pnpm loop start-run` / `end-run` | 记录外循环迭代（手动记账） |
| `pnpm loop dashboard` | 后台启动看板（无控制台窗口） |
| `pnpm loop dashboard stop` | 关闭看板 |
| `pnpm loop dashboard status` | 查看看板状态 |

完整列表：`pnpm loop help`

## 首次使用

```powershell
pnpm loop init --project <项目名> --branch main
pnpm loop add-feature --title "首个功能模块"
pnpm loop add-story --title "首个 Story" --parent-id FT-001
pnpm loop confirm-story US-001   # 确认后才会被 next / run 选中
```

## Story 状态

- **draft**（默认）：新建 Story，须用户确认后才可执行
- **ready**：已确认，可被 `next` / 外循环选中
- 修改已完成的 Story 内容会回到 **draft**

## 规则

- 状态以项目内 `.loop/` 为准，**只用 CLI** 读写
- 不直接手改 `.loop/` 内 JSON（除非用户明确要求）
- 命令失败时读 stderr，未初始化则先 `loop init`
- 多项目：切换工作区后重新设置 `LOOP_PROJECT_ROOT`

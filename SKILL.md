---
name: loop
description: >-
  管理 Loop 工程迭代状态（Skill + Shell，无需 MCP）。
  用 Shell 调用 status/next/complete/progress 等命令。
  在用户做 Agent 迭代、管理 PRD Story、查看 Loop 进度时使用。
---

# Loop

用 Shell 管理 Loop 迭代状态，输出 JSON。**不配置 MCP**，直接调用 CLI。

## 环境

**项目根** = 当前 Cursor 工作区根目录。**状态目录** = 项目内 `loop-data/`。**CLI 目录** = skill 根目录下的 `cli/`。

在工作区根目录执行：

```powershell
$env:LOOP_PROJECT_ROOT = (Get-Location).Path
.\loop.ps1 status   # 或 ./loop.sh status
```

CLI 使用编译后的 `cli/dist/cli.js`（`node` 直接运行，无需 tsx）。

## 自动迭代（外循环）

自动多轮调用 AI，每轮实现一个 Story：

```powershell
pnpm loop run                    # 默认 agent/claude，最多 10 轮
pnpm loop run --tool agent 20    # 指定工具与轮数
pnpm loop run --tool claude --max-iterations 5
pnpm loop watch --tool agent              # 持续循环（监听 Story，不退出的）
pnpm loop run --until-stop --tool agent   # 同上，另开终端 loop run stop 结束
pnpm loop run --workers 3 --until-stop --tool agent   # 3 个并行 worker（git worktree 隔离）
```

提示词：`loop-data/AGENT.md`（可覆盖）或 CLI 内置 `templates/AGENT.md`。

## 需求规划

单次调用规划 Agent，将自然语言需求转为 Feature / Story 调整建议（**不直接改代码**）：

```powershell
pnpm loop plan --requirement "把登录拆成前端表单与后端 API"
pnpm loop plan --story-id US-003 --requirement "细化验收标准"
pnpm loop plan --tool claude --requirement "新增 3D 展示模块"
```

提示词优先级：`LOOP_PLANNER_PROMPT` 环境变量 → `loop-data/PLANNER.md` → 内置 `templates/PLANNER.md`。

## 每轮迭代（手动）

```powershell
pnpm loop status          # 总进度
pnpm loop next            # 下一 Story
pnpm loop patterns        # Codebase Patterns

pnpm loop start-run --iteration 1 --tool cursor

# 实现代码、测试、commit 后：
pnpm loop complete US-001
pnpm loop progress --story-id US-001 --summary "实现了什么" --learning "学到的模式"
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
| `pnpm loop bug US-xxx "缺陷描述"` | 追加 Bug 反例 AC（推荐） |
| `pnpm loop add-feature --title "..."` | 添加 Feature 分组 |
| `pnpm loop plan [--tool agent] [--story-id US-xxx] [--requirement "..."]` | 单次规划 Agent（读 PLANNER.md，输出 PRD 建议，不改代码） |
| `pnpm loop watch [--tool agent]` | 持续外循环（全部完成后仍监听，不退出的） |
| `pnpm loop run [--tool agent] [N]` | 外循环自动迭代（有限轮数） |
| `pnpm loop run --workers 3` | 并行 Agent（worktree + Story 认领） |
| `pnpm loop run --until-stop` | 持续外循环，直到 `loop run stop` |
| `pnpm loop run stop` / `run status` / `run output` | 停止 / 状态 / 读取 Agent live 输出（`--worker w0`、`--text` 纯文本） |
| `pnpm loop start-run` / `end-run` | 记录外循环迭代（手动记账） |
| `pnpm loop dashboard` | 后台启动看板（无控制台窗口） |
| `pnpm loop dashboard dev` | 开发模式看板（热更新，:5173） |
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

## 缺陷 / Bug（AC 反例）

**不单独建 Bug 实体**，缺陷通过 **`pnpm loop bug`** 写入 Story 的 **acceptanceCriteria** 反例：

```powershell
pnpm loop bug US-001 "具体缺陷描述"
pnpm loop bug US-001 "具体缺陷描述" --ready    # 追加后直接可执行
pnpm loop confirm-story US-001                  # 默认 draft，需确认
```

等价于追加 AC `不应出现：…`；若源 Story **已完成**（`passes: true`），会自动 **新建修复 Story**（AC 为 `不应再出现：…`），不会修改已完成 Story。

约定：

- 反例 AC 前缀：**`不应出现：…`**（进行中）或 **`不应再出现：…`**（修复 Story）
- **Story 未完成**：`loop bug` 追加到当前 Story，默认 `draft`
- **Story 已完成**：`loop bug` 新建修复 Story，勿改已完成 Story 的 AC
- Agent 实现 Story 时，**所有 AC（含反例）均须满足**后才能 `complete`

## 规则

- 状态以项目内 `loop-data/` 为准，**只用 CLI** 读写
- 不直接手改 `loop-data/` 内 JSON（除非用户明确要求）
- 命令失败时读 stderr，未初始化则先 `loop init`
- 多项目：切换工作区后重新设置 `LOOP_PROJECT_ROOT`

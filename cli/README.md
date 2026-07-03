# Loop CLI

Loop Engineering 项目运行状态工具。将 Milestone、Feature、Story、Patterns、进度、迭代记录存入**项目本地 JSON**（`.loop/` 目录），供 Cursor Agent 通过 **Shell CLI** 读写。

> Agent 使用方式：加载 Skill `.cursor/skills/loop/SKILL.md`，通过 `pnpm loop <command>` 调用，**无需 MCP 配置**。

## 前置要求

- **Node.js** 18+（推荐 20+）
- **pnpm**（`npm install -g pnpm`）

## 安装

```bash
cd .cursor/skills/loop/cli
pnpm install
```

CLI 通过 **tsx 直接运行 `src/`**，无需 `pnpm build`。看板静态资源需 `pnpm build:ui`（或开发时用 `pnpm dev`）。

验证：

```powershell
$env:LOOP_PROJECT_ROOT = (Get-Location).Path
pnpm loop status
```

## CLI 用法

```powershell
$env:LOOP_PROJECT_ROOT = (Get-Location).Path
cd .cursor/skills/loop/cli
pnpm loop help
pnpm loop status
pnpm loop next
pnpm loop complete US-003
```

| CLI 命令 | 说明 |
|----------|------|
| `loop status` | 总览进度 |
| `loop next` | 下一待做 Story |
| `loop patterns` | Codebase Patterns |
| `loop complete US-xxx` | 标记 Story 完成 |
| `loop progress --summary "..."` | 追加进度 |
| `loop add-pattern "..."` | 添加模式 |
| `loop init` | 初始化 `.loop/` 项目元数据 |
| `loop import` / `pnpm sync` | prd.json → `.loop/`（可选） |
| `loop export` / `pnpm sync:export` | `.loop/` → prd.json（可选） |
| `loop start-run` / `loop end-run` | 外循环记录 |
| `loop dashboard` / `dashboard start` | 后台启动看板 |
| `loop dashboard stop` / `stop-dashboard` | 关闭看板 |
| `loop dashboard status` | 查看看板状态 |
| `pnpm dashboard` | 前台启动看板（开发用） |

多项目：每次命令设置对应 `LOOP_PROJECT_ROOT`。

## 环境变量

| 变量 | 说明 |
|------|------|
| `LOOP_PROJECT_ROOT` | **必填**，目标项目根目录 |
| `LOOP_STATE_DIR` | 可选，状态目录，默认 `{root}/.loop` |
| `LOOP_SPEC_DIR` | 可选，prd.json / progress.txt 目录，默认与状态目录相同 |
| `LOOP_DASHBOARD_PORT` | 可选，看板端口，默认 `3460` |
| `LOOP_PROJECT_NAME` | 可选，多项目时指定项目名 |

## 状态看板

```powershell
$env:LOOP_PROJECT_ROOT = (Get-Location).Path
pnpm dashboard
```

默认 http://localhost:3460 ，Feature/Story 脑图、Patterns、进度、迭代记录。

前端开发：

```bash
pnpm dev          # 热更新 UI :5173 + API :3460
pnpm build:ui     # 构建到 public/
```

## Agent 迭代流程

| 步骤 | CLI | 说明 |
|------|-----|------|
| 1 | `loop status` | 查看总进度 |
| 2 | `loop patterns` | 读取 Codebase Patterns |
| 3 | `loop next` | 取下一 Story |
| 4 | `loop start-run --iteration N --tool cursor` | 记录迭代开始 |
| 5 | *实现代码、测试、commit* | — |
| 6 | `loop complete US-xxx` | 标记完成 |
| 7 | `loop progress --summary "..."` | 追加进度 |
| 8 | `loop add-pattern "..."` | 可复用模式 |
| 9 | `loop end-run --run-id N --status completed` | 结束迭代 |

## 数据存储

```
{LOOP_PROJECT_ROOT}/.loop/
├── project.json
├── milestones/MS-001.json
├── features/FT-001.json
├── stories/US-001.json
├── patterns.json
├── progress.json
├── runs.json
└── dashboard.json   # 看板进程状态（运行时）
```

`prd.json` / `progress.txt` 仅在手动 `loop export` 时生成，不是日常存储的一部分。

`.loop/` 建议加入 `.gitignore`。

## 目录结构

```
.cursor/skills/loop/cli/
├── ui/               # React 看板源码
├── public/           # 构建产物
├── src/
│   ├── cli.ts        # CLI 入口
│   ├── dashboard.ts  # 看板入口
│   ├── server.ts     # HTTP API
│   ├── db.ts         # JSON 数据层
│   └── sync.ts       # prd.json 同步（可选）
└── package.json
```

## 故障排查

| 现象 | 处理 |
|------|------|
| `LOOP_PROJECT_ROOT 未设置` | 命令前设置环境变量 |
| `项目未初始化` | `pnpm loop init --project <名称>` |
| 看板无数据 | 先 `loop init` 并添加 Story；UI 需 `pnpm build:ui` 或 `pnpm dev` |

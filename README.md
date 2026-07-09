# Loop 使用手册

用 Story 拆分需求，让 Cursor Agent 逐条实现；状态保存在项目 `loop-data/`，通过 CLI 管理，无需 MCP。

## 安装

需要 Node.js 18+。

发布包已包含编译产物（`cli/dist/` + `cli/public/`），**日常使用无需安装依赖或 build**。

开发者修改源码时：

```bash
cd cli && pnpm install && pnpm build
```

看板开发模式（热更新）需 dev 依赖：`pnpm dev`（在 `cli` 目录）

## 发布精简包

不含 `src/`、`ui/` 源码，仅运行所需文件：

```bash
./scripts/release.sh          # macOS / Linux
./scripts/release.ps1         # Windows
./scripts/release.sh --zip    # 额外生成 release.tar.gz（Windows 为 release.zip）
```

输出目录 `release/`，可直接复制到 `.cursor/skills/loop`。

## 快捷脚本

在项目根或 skill 根目录使用 `loop.ps1`（Windows）/ `loop.sh`（macOS/Linux），自动设置 `LOOP_PROJECT_ROOT`，无需 `cd cli`。

## 初始化项目

```powershell
.\loop.ps1 init --project <项目名>
.\loop.ps1 add-feature --title "功能模块"
.\loop.ps1 add-story --title "第一个 Story" --parent-id FT-001
.\loop.ps1 confirm-story US-001
```

## 自动迭代

```powershell
.\loop.ps1 -Tool agent -MaxIterations 10          # Windows
./loop.sh --tool agent 10                          # macOS / Linux
```

持续循环（监听 Story、不退出的）：

```powershell
.\loop.ps1 watch --tool agent          # Windows
./loop.sh watch --tool agent           # macOS / Linux
```

另开终端 `.\loop.ps1 run stop` 结束。全部 Story 完成后仍保持监听，等待新增 Story。

## 看板

```powershell
.\loop.ps1 dashboard              # 生产模式，默认 http://localhost:3460
.\loop.ps1 dashboard dev          # 开发模式（热更新），http://localhost:5173
.\loop.ps1 dashboard stop
.\dev.ps1                         # 同上 dev 快捷方式
```

## 需求规划

```powershell
.\loop.ps1 plan --requirement "拆分登录模块"
.\loop.ps1 plan --story-id US-003 --requirement "细化 AC"
```

单次调用规划 Agent，读取 `PLANNER.md`（可用 `LOOP_PLANNER_PROMPT` 或 `loop-data/PLANNER.md` 覆盖），输出 PRD 调整建议，不直接修改代码。

## 日常命令

| 命令 | 作用 |
|------|------|
| `.\loop.ps1 plan --requirement "..."` | 需求规划 Agent |
| `.\loop.ps1 status` | 查看进度 |
| `.\loop.ps1 next` | 下一个 Story |
| `.\loop.ps1 complete US-xxx` | 标记完成 |
| `.\loop.ps1 add-story --title "..."` | 添加 Story |
| `.\loop.ps1 bug US-xxx "描述"` | 记录缺陷 |
| `.\loop.ps1 help` | 全部命令 |

macOS / Linux 将 `.\loop.ps1` 换为 `./loop.sh`。

新建 Story 默认为草稿，需 `confirm-story` 后才会被自动迭代选中。

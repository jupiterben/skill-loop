# Loop 使用手册

用 Story 拆分需求，让 Cursor Agent 逐条实现；状态保存在项目 `loop-data/`，通过 CLI 管理，无需 MCP。

## 安装

需要 Node.js 18+。

> 首次运行 dashboard 前需在仓库根目录执行 `pnpm install && pnpm build` —— 编译产物 `dist/`、`public/assets` 已被 `.gitignore` 忽略，clone 仓库时不会随代码下载，直接启动 dashboard 会因加载不到前端资源而 404。

若你使用的是已发布的精简包（`./scripts/release.sh` 产物），其中已包含编译产物，`日常使用无需安装依赖或 build`。

从源码运行或开发者修改源码时：

```bash
pnpm install && pnpm build
```

看板开发模式（热更新）需 dev 依赖：`pnpm dev`（在仓库根目录）

## 发布精简包

不含 `src/` 源码，仅包含根目录入口、`package.json`、`dist/`、`public/` 和 `templates/` 等运行所需文件：

```bash
./scripts/release.sh          # macOS / Linux
./scripts/release.ps1         # Windows
./scripts/release.sh --zip    # 额外生成 release.tar.gz（Windows 为 release.zip）
```

输出目录 `release/`，可直接复制到 `.cursor/skills/loop`。

## 快捷脚本

在项目根或 skill 根目录使用 `loop.ps1`（Windows）/ `loop.sh`（macOS/Linux），自动设置 `LOOP_PROJECT_ROOT`，无需切换目录。

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

使用已安装并登录的 Codex CLI：

```powershell
.\loop.ps1 -Tool codex -MaxIterations 1
pnpm loop plan --tool codex --requirement "细化验收标准"
```

Dashboard 的启动工具列表也可选择 `codex`。Loop 继承本机 Codex CLI 的模型和认证配置。
当前 Codex 调用沿用 `--dangerously-bypass-approvals-and-sandbox`，不提供沙箱隔离，仅在可信项目与受控执行环境中运行。

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
```

## 项目 Agent 配置

在 Dashboard 的 **Agent 配置** 页新建配置，填写名称、CLI 和模型。
CLI 下拉框只列出本机 PATH 中已安装的工具，启动与 Story 选择器使用相同的检测结果。
工具别名不重复展示；已有配置在工具卸载后仍保留并标记为未安装。安装检测不代表已经登录。
模型支持搜索下拉选择，也可输入自定义名称；Codex 候选读取本机 CLI 模型目录，
其他 CLI 展示项目已保存的模型。模型目录不代表当前账号一定拥有调用额度。
同一个 CLI 可以保存多套配置；模型留空使用工具默认值，认证继续使用本机 CLI。
配置仅保存在当前项目的 `loop-data/agent-config.json`，不会修改全局配置或保存密钥。

```powershell
pnpm loop agents add --name "Codex 开发" --tool codex --model "your-model-id"
pnpm loop agents list
pnpm loop agents default AG-001
pnpm loop set-story-agent US-006 AG-001
pnpm loop run --agent-profile AG-001 --max-iterations 1
pnpm loop plan --agent-profile AG-001 --requirement "细化验收标准"
```

配置选择顺序：启动时显式指定 > Story 指定 > 项目默认 > 自动探测。
`--agent-profile` 与 `--tool` 不能同时使用；直接指定 `--tool` 使用该 CLI 的默认设置。
`plan` 没有 Story 执行分配，因此只使用显式选择或项目默认。
运行开始时固定配置快照，后续编辑从下一次运行生效；执行记录保存当时的配置名和模型。

可以用 `agents update AG-001 --model "other-model"` 编辑，
`agents update AG-001 --clear-model` 清空模型，
`agents default none` 清除默认，`agents remove AG-001` 删除未被引用的配置。
停用配置使用 `--disabled`，重新启用使用 `--enabled`。

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
| `.\loop.ps1 patterns` | Codebase Patterns |
| `.\loop.ps1 complete US-xxx` | 标记完成 |
| `.\loop.ps1 add-story --title "..."` | 添加 Story |
| `.\loop.ps1 bug US-xxx "描述"` | 记录缺陷 |
| `.\loop.ps1 help` | 全部命令 |

macOS / Linux 将 `.\loop.ps1` 换为 `./loop.sh`。

新建 Story 默认为草稿，需 `confirm-story` 后才会被自动迭代选中。

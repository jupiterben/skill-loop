# skill-loop 项目理解

> 作者视角对 skill-loop 的整体理解。`README.md` 是用户使用手册（怎么装、怎么用），`SKILL.md` 是 Skill 装载提示（Agent 怎么调用 CLI），本文档回答的是**"这个项目到底是什么、怎么组织、为什么这么设计"**。

---

## 1. 一句话定位

**skill-loop** = 一个把项目需求拆成 *Feature → Story*，再用 AI Agent 在外循环里**逐条自动实现**的工作流框架。它本身不写业务代码，而是给 Cursor / Claude / CodeBuddy / OpenCode 等 AI CLI 提供**一个受约束的、可观察的、可并行**的"开发 loop"。

它刻意避开了 MCP —— 只暴露一个 `pnpm loop <cmd>` Shell CLI，让任何能跑 shell 的 Agent 都能用。

---

## 2. 项目结构

```
skill-loop/
├── README.md              # 用户使用手册（安装/命令/看板）
├── SKILL.md               # Agent Skill 装载提示（命令速查）
├── loop.sh / loop.ps1     # 跨平台入口（自动设 LOOP_PROJECT_ROOT）
├── loop-data/             # 【git tracked】项目级 PRD 状态
│   ├── project.json       # 项目元信息（name/branch/vision）
│   ├── project-spec.json  # 项目技术栈规范（agent 写代码前会读）
│   ├── patterns.json      # Codebase Patterns（agent 跨轮可复用的约定）
│   ├── progress.json      # Story 完成时间线 + learning
│   ├── features/          # FT-*.json（Feature 节点，可嵌套）
│   ├── stories/           # US-*.json（叶子 Story，含 AC/依赖/状态）
│   └── milestones/        # 里程碑节点（可选）
├── cli/                   # 核心实现（Node.js + TypeScript + pnpm）
│   ├── src/
│   │   ├── cli.ts         # 命令入口、参数解析、help 文本
│   │   ├── cli-args.ts    # 参数定义
│   │   ├── db.ts          # 【1581 行】LoopStateDb：所有 loop-data 读写
│   │   ├── loop-run.ts    # 【962 行】外循环主逻辑（worker 调度 + 工具调用）
│   │   ├── loop-run-launcher.ts / run-process.ts / run-live.ts
│   │   │                  # 外循环状态文件、运行时 live 输出缓冲
│   │   ├── claude-invoke.ts     # Claude / CodeBuddy 进程包装
│   │   ├── opencode-invoke.ts   # OpenCode NDJSON 解析包装
│   │   ├── worktree-pool.ts     # 并行 worker 的 git worktree 隔离
│   │   ├── tree.ts / feature-leaf.ts  # Story 树/选下一个/删叶子校验
│   │   ├── bug-ac.ts            # "不应出现：…" 反例 AC 工具
│   │   ├── story-work-type.ts   # Story 类型枚举（实现/文档/规划/测试/重构）
│   │   ├── types.ts / paths.ts  # 共享类型 & 路径常量
│   │   ├── api.ts / server.ts / http-handlers.ts / runtime-entry.ts
│   │   │                        # 看板 HTTP 后端（HTTP API 读 loop-data）
│   │   ├── dashboard-process.ts # 看板子进程管理
│   │   ├── config.ts / json-fs.ts / loop-plan.ts / project-spec-templates.ts
│   │   └── get-project-name.ts  # 单文件工具
│   ├── templates/
│   │   ├── AGENT.md       # 给 AI Agent 的"每轮怎么干活"指令
│   │   └── PLANNER.md     # 给规划 Agent 的"怎么拆需求"指令
│   ├── ui/                # React + Vite + Ant Design 看板前端
│   └── package.json / tsconfig.json / vite.config.ts / vitest.config.ts
├── docs/                  # 补充文档（本文件所在地）
├── scripts/               # release.mjs / release.sh（打精简包）
├── .loop-status/          # 【git ignored】外循环运行时状态
│   ├── run.json / coordinator.json / workers/*.json
│   └── runs/<worker>-live.json  # 每个 worker 的 live 输出
├── REVIEW_FIXES_PLAN.md   # 2026-08 代码 review 待办清单
└── .gitignore
```

---

## 3. 核心机制

### 3.1 Story 生命周期

```
draft  --confirm-story-->  ready  --loop run 选中-->  claimed
                                                              │
                                                              ▼
                                                ┌── agent 跑完 + complete ──┐
                                                │                            │
                                            done (passes: true)          done (passes: false)
```

- **draft**：新建 Story 的默认状态，**不会被** `loop next` / 外循环选中
- **ready**：用户（通过 dashboard 或 `confirm-story`）显式确认后才进入
- **claimed**：外循环 worker 抢占后写入 `LOOP_CLAIMED_STORY_ID`（防止多 worker 重复抢）
- **done**：执行 `loop complete US-xxx` 写入
- **修改已完成的 Story 内容会自动回到 draft**（防止既成事实被悄悄改动）

### 3.2 外循环怎么跑

`loop run` / `loop watch` 启动后，循环做这件事：

1. 调 `LoopStateDb.getNextStory()` 选一个 ready 且依赖满足的 Story
2. 用 `worktree-pool` 在独立 git worktree 里起一个 worker
3. 把"AGENT.md 模板 + Story JSON"作为 prompt 喂给选定的 AI CLI
4. 解析 AI 输出的 `<promise>COMPLETE</promise>` tag 判断本轮是否终止
5. 写 `runs/<worker>-live.json` 让 dashboard 实时展示
6. 合并 worktree 分支 → 清理 → 进下一轮

`loop watch` / `--until-stop` 模式下不退出；`loop run stop` 通过 `.loop-status/run.json` 的 `stopRequested: true` 信号让 worker 主动停。

### 3.3 AI 怎么被指挥

`cli/templates/AGENT.md` 是一份给 AI 的"剧本"，关键指令：

1. 先 `pnpm loop status` / `pnpm loop patterns`（看项目状态 + 已有约定）
2. 实现当前 Story（含 AC 反例 `不应出现：…` / `❌ …`）
3. 跑项目质量检查（test/lint/typecheck）
4. `feat: [Story ID] - [Title]` 格式 commit
5. `pnpm loop complete <id>` + `pnpm loop progress` 记账
6. **只有全部 Story 完成才输出 `<promise>COMPLETE</promise>`** —— 这是外循环唯一的停止信号

> 这套设计很巧妙：AI 输出的"语义"被压缩成一个字符串 sentinel，外循环不需要解析自然语言，**只要 grep COMPLETE tag** 就能判断本轮是否完结。

### 3.4 并行 worker + git worktree

`--workers N` 模式下：

- 每个 worker 在 `git worktree add <branch>` 里跑，分支名形如 `loop/w0/US-xxx`
- Worker 启动时协调器写 `LOOP_CLAIMED_STORY_ID`，worker **只能实现这一条**
- Worker 完成后 `mergeWorktreeBranch` 把分支合并回主分支
- 自动清理 worktree

**冲突降低策略**（AGENT.md 强制要求）：

- 新代码按 Feature 目录隔离（`src/features/<feature>/`）
- 改公共文件（路由表、barrel `index.ts`）的改动必须最小
- 多个 Story 改同一文件 → 规划时就要让它们有依赖关系

### 3.5 Bug 不单独建实体

> 设计哲学：bug 是 **AC 的反例**，不是新数据。

`pnpm loop bug US-xxx "描述"` 走两条路径：

- **Story 未完成**：往 AC 里追加 `不应出现：…`（保持 draft）
- **Story 已完成（`passes: true`）**：**新建**一个修复 Story，AC 为 `不应再出现：…`，原 Story 保持只读

这样历史 Story 不会被"事后篡改"，所有 bug 都在 Story 树的某个节点里有迹可循。

---

## 4. 状态文件布局

### 4.1 `loop-data/`（git tracked）

| 文件 | 作用 |
|------|------|
| `project.json` | 项目名、git 分支、vision |
| `project-spec.json` | 技术栈规范（agent 写代码前必读） |
| `patterns.json` | 跨 Story 可复用的约定（自增长） |
| `progress.json` | 每个 Story 完成时间线 + summary + learning |
| `features/FT-*.json` | Feature 节点（可嵌套），描述 + 子节点 |
| `stories/US-*.json` | 叶子 Story：title/description/AC/workType/status/dependsOn |
| `milestones/*.json` | 里程碑（可选） |

> 约定：用户和 Agent 都**只通过 CLI** 读写这些文件，**不要手改 JSON**。

### 4.2 `.loop-status/`（git ignored）

外循环运行时的瞬时状态：

- `run.json` — 外循环是否在跑、最大轮数
- `coordinator.json` — 多 worker 协调状态（next 选 Story、claim 分配）
- `workers/wN.json` — 每个 worker 的 PID / 当前 Story / 停止信号
- `runs/wN-live.json` — 每个 worker 实时 stdout/stderr（dashboard 拉这个）

---

## 5. AI 工具支持

外循环支持这些 AI CLI（`--tool <name>`）：

| Tool | 命令 | 适配情况 | 默认模型 |
|------|------|---------|---------|
| `agent` | Cursor Agent CLI | ✅ 基础 | — |
| `claude` | Anthropic Claude Code | ✅ 基础 | auto（gateway 路由，慢） |
| `codebuddy` | 腾讯 CodeBuddy | ✅ 稳定（实测 1 跑 8 Story） | — |
| `opencode` | OpenCode | ⚠️ agent 模式不自停，长 prompt 偶发 hang | `free/deepseek-v4-flash` |
| `minimax` | MiniMax（复用 opencode 调 `minimax-m3`） | ⚠️ 走 opencode 同条路径，agent 模式问题同上 | `free/minimax-m3` |
| `codex` | OpenAI Codex | ⚠️ 用 `--dangerously-bypass-approvals-and-sandbox` | — |
| `cursor` | 别名 → agent | — | — |

`autoDetect` 优先级：`opencode > codebuddy > claude > agent > codex`（minimax 故意不进 autoDetect，要显式指定）。

**为什么 opencode/minimax 不行**：opencode 的 `run - <prompt` 是 **agent 模式**，会自己探索项目、反复调工具、不会主动 end；而 codebuddy/claude 是 **one-shot** 模式，接 prompt 完成一轮就退出。loop 的整个并发模型建立在"每轮能干净退出"上，所以 agent 模式工具需要额外加 timeout / max-steps 之类的退出条件才适合上 loop。

---

## 6. 关键设计决策

### 6.1 为什么不用 MCP

> SKILL.md 标题就写了："**不配置 MCP，直接调用 CLI**"。

- MCP 需要 Agent 支持（目前只有 Claude/Cursor 完整支持）
- Shell + JSON 是所有 Agent 的公共子集
- 换 Agent 不需要换协议
- CLI 自身可以被脚本/管道调用，可观测性更好

### 6.2 为什么 Story 单元粒度

一个 Story 对应一个 commit + 一次 complete。粒度太小（每条 AC 一条 Story）→ 协调成本爆炸；粒度太大（一 Feature 一 Story）→ 容易半成品 commit。**当前粒度 = "一次能完整交付的最小用户价值单元"**。

### 6.3 为什么状态用文件而不是数据库

- `loop-data/` 在 git 里 → PR 评审能看见 PRD 变更
- 人类可读、可手 diff（虽然约定不让手改）
- 不需要起服务，dashboard 只是个读 loop-data 的 HTTP 壳
- 跨机器协作（git push = 同步 PRD）

### 6.4 为什么 COMPLETE 用 sentinel 字符串

`<promise>COMPLETE</promise>` 是 XML 风格的 sentinel tag，**几乎不可能在自然语言中意外出现**。比 EOF / "DONE" / 空 stdout 都鲁棒。

### 6.5 worktree 而不是 branch 直接切

多 worker 并发时如果在同一个 working tree 跑，会出现：

- worker A 切到 feat/x，worker B 切到 feat/y → A 的测试跑的是 B 的代码
- 各自 worktree 隔离 → 互不污染，结束再 merge

---

## 7. 已知问题 / 代码 review 待办

来自 `REVIEW_FIXES_PLAN.md` 和实际经验：

### 7.1 God 文件

- `db.ts` **1581 行**：所有 loop-data 读写都堆在 `LoopStateDb` 一个类里。建议按"领域"拆分（`feature-store.ts` / `story-store.ts` / `progress-store.ts` / `patterns-store.ts`），`db.ts` 留个 facade。
- `loop-run.ts` **962 行**：外循环主逻辑 + worktree 协调 + 工具调用调度混在一起。建议拆 `worker-coordinator.ts` / `tool-dispatch.ts` / `prompt-builder.ts`。
- `cli.ts` **839 行**：命令入口 + help 文本 + 参数解析放一起。`cli-args.ts` 已有雏形，可继续拆。
- `api.ts` **505 行**：HTTP handler 实现，混着业务逻辑。

### 7.2 状态/类型问题

- `type` 字段在某些地方是字符串、某些地方是 enum，TS 严格度不足
- 多个 `status` 字段含义不一致（"ready" 在 Story 是"可执行"，在 run 是"运行中"）

### 7.3 pnpm 11 兼容性（US-043 卡点）

pnpm 11 引入 `allowBuilds` 配置，**必须放在 `pnpm-workspace.yaml` 里**（不能放 `~/.config/pnpm/config.yaml`）。如果只删 `pnpm-workspace.yaml` 不补这个配置，`pnpm build` / `pnpm test` 全部失败。US-043 原本想"删 workspace.yaml 简化结构"，但 pnpm 11 不允许。

### 7.4 测试覆盖

- 单元测试集中在 `db.ts` 一些纯函数
- 外循环集成测试缺失（之前 codebuddy 跑通 8 Story 是端到端验证，但没有自动化测试）
- `worktree-pool.ts` 的合并冲突场景没有 fixture

### 7.5 死代码（已清）

之前 review 发现并清掉：

- amp tool 引用（已不再支持）
- MCP 相关 alias 残留
- 中文命令别名（`循环` / `forever`）
- `loop-cli.config.json` 的自指黑魔法（被覆盖的循环 import）
- README 里的 MCP 残留提示
- dev.sh 多余 Dashboard 启动路径

---

## 8. 给后续维护者的建议

1. **加新 AI 工具**：在 `cli/src/` 加一个 `xxx-invoke.ts`（实现 `invokeXxxProcess(prompt, { cwd, env, handlers, model? })`），在 `loop-run.ts` 的 `VALID_TOOLS` / `resolveTool` / `invokeToolWithPrompt` / 错误信息四处加钩子。参考 `opencode-invoke.ts` 写法（NDJSON 解析模板）。
2. **加新 Story 类型**：在 `cli/src/story-work-type.ts` 的 enum + label map 同步；AGENT.md 模板里加对应规则。
3. **加新 CLI 命令**：在 `cli/src/cli.ts` 加 case，在 `SKILL.md` 命令速查表补一行。
4. **改 PRD 状态结构**：先动 `cli/src/types.ts` → `db.ts` → 看板 API → 看板 UI，从下往上。**别忘了** 检查 `.loop-status/` 的字段有没有同步依赖。
5. **跑通后再改**：任何对外行为（CLI flag、Story 状态、AC 语义）变更前先跑一次 `loop run --tool codebuddy --max-iterations 1` 冒烟。

---

## 9. 一句话总结

> **skill-loop = 一个"给 AI 开发上紧箍咒"的工具**：用 Story 拆细活、用 worktree 隔离并发、用 CLI 替代 MCP、用 sentinel 字符串替代语义解析、用 JSON 文件替代数据库。**让 AI 写代码这件事从"黑盒"变成"可观察、可回滚、可并行、可审计"的工作流。**

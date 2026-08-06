# Skill-Loop Review 修复计划（已写入 loop-data/）

> 根据代码 review 整理的 26 个 Story + 6 个 Feature，均以 `draft` 状态写入 `loop-data/`，等用户 `confirm-story` 后可被外循环自动执行。

## 总览

| 指标 | 数值 |
|------|------|
| 新增 Feature | 6（FT-027 ~ FT-032） |
| 新增 Story | 26（US-039 ~ US-064） |
| 全部默认 `status=draft` `passes=false` | 等用户在 Dashboard confirm |
| workType 分布 | 重构 12 / 测试 4 / 文档 3 / 代码实现 0 / 文档补全 0 |

---

## FT-027: CLI 表面清理与命名统一（6 Stories）

清理半残废特性与历史包袱，让 CLI 表面更干净。

| Story | workType | 标题 | 优先级 |
|-------|----------|------|--------|
| US-039 | refactor | 删除 amp 工具支持 | 2 |
| US-040 | refactor | 删除冗余命令别名（中文/forever/MCP 残留） | 2 |
| US-041 | refactor | 统一 loop-cli → loop 命名 | 1 |
| US-042 | refactor | 删除多余 Dashboard 启动路径与 dev.sh | 2 |
| US-043 | refactor | 删除 pnpm-workspace.yaml（单包不需要） | 3 |
| US-044 | refactor | 删除 loop-cli.config.json 自指黑魔法 | 2 |

**价值**：收敛 4 种 dashboard 启动路径 / 4 处命名不一致 / 多个 dead code，**1-2 小时内**可清完。

---

## FT-028: 死代码与历史包袱清理（2 Stories）

| Story | workType | 标题 | 优先级 |
|-------|----------|------|--------|
| US-045 | refactor | 删除分支归档与 .last-branch 状态 | 2 |
| US-046 | refactor | 清理 LEGACY_STATUS_FILES 中未使用项 | 3 |

**价值**：`.loop-status/` 瘦身；每次 `loop run` 少 2-3 个文件 I/O。

---

## FT-029: God file 拆分重构（4 Stories）

| Story | workType | 标题 | 优先级 |
|-------|----------|------|--------|
| US-047 | refactor | 拆分 db.ts（按 entity 拆 facade） | 1 |
| US-048 | refactor | 拆分 loop-run.ts（tool-invoke/worker/coordinator） | 1 |
| US-049 | refactor | 拆分 api.ts（路由注册式） | 2 |
| US-050 | refactor | 拆分 cli.ts（commands/aliases/main） | 2 |

**价值**：1581 → 多文件（每文件 < 400 行），可读性 + 可测性双提升。

**建议执行顺序**：先 US-049（最简单收益明确）→ US-050 → US-048 → US-047（最后，最复杂）。

---

## FT-030: 重复逻辑与 API 设计收敛（7 Stories）

| Story | workType | 标题 | 优先级 |
|-------|----------|------|--------|
| US-051 | refactor | workType 强制显式选择（description 推断仅作兜底） | 2 |
| US-052 | refactor | 合并 run 状态路径（单 worker / 多 worker 统一） | 2 |
| US-053 | refactor | 抽取工具启动公共函数（claude/codex/agent） | 2 |
| US-054 | refactor | 抽取 API body 字段提取 helper | 3 |
| US-055 | refactor | 合并 deletable 概念（UI 与 CLI 统一） | 3 |
| US-056 | refactor | Pattern 改用稳定 ID（消除 index 定位的 footgun） | 2 |
| US-057 | refactor | API 统一 RESTful（删除重复 /update 路径） | 2 |

**价值**：
- US-056 解决 index 漂移这个 footgun（设计 bug）
- US-057 让 API 表面一致
- US-052 让 run 状态路径少 50% 代码

---

## FT-031: CLI 核心测试覆盖（4 Stories）

CLI 状态机目前 **0 测试 / 3388 行核心代码**，这是最大的风险面。

| Story | workType | 标题 | 优先级 |
|-------|----------|------|--------|
| US-058 | testing | 为 CLI 配 vitest | 1 |
| US-059 | testing | 补 db.ts 单元测试（生命周期/依赖环/bug 派生/claim 冲突） | 1 |
| US-060 | testing | 补 tree.ts 单元测试 | 2 |
| US-061 | testing | 补 loop-run.ts 单元测试（工具解析/提示词拼装） | 2 |

**价值**：任何后续重构（拆 God file 那一坨）有保护网。覆盖率目标：db 核心 > 80%。

---

## FT-032: 文档同步（3 Stories）

| Story | workType | 标题 | 优先级 |
|-------|----------|------|--------|
| US-062 | documentation | README 增加 dashboard 首次 build 提示 | 2 |
| US-063 | documentation | SKILL.md 移除 MCP 残留提示 | 2 |
| US-064 | documentation | 命名统一后文档引用同步 | 3 |

**价值**：解决"用户 clone 后立即 404"的入门体验问题。

---

## 建议执行顺序

```
第 1 波（30 min，0 风险）  US-039, US-040, US-043, US-044    →  删死代码
                       US-041, US-042                       →  命名/启动路径
                       US-062, US-063                       →  文档
                       US-058                                →  配 vitest

第 2 波（半天）         US-059, US-060, US-061              →  核心测试保护网
                       US-045, US-046                       →  死代码归档
                       US-051, US-054                        →  收敛小重构

第 3 波（半天~1天）     US-049, US-050, US-048, US-047      →  God file 拆分
                       US-052, US-053, US-055                →  状态合并与共享
                       US-056, US-057                        →  设计收敛

最后                  US-064                                →  命名统一后文档收尾
```

---

## 接下来怎么用

1. **逐个 review**：现在 Story 都是 `draft`，可以在 Dashboard 打开看 AC 准不准
2. **批量 confirm**：没问题就用 `loop confirm-story US-039` 一个个改成 ready
3. **小批量自动跑**：
   ```bash
   loop run --tool agent --max-iterations 5
   ```
   让 Agent 跑第 1 波（已配测试 + 删死代码）— 改动小、有测试保护
4. **大改动手动跑**：第 2-3 波的 God file 拆解建议手动执行（小步快跑，每拆完一个跑测试）

---

## 文件清单

```
loop-data/
├── features/
│   ├── FT-027.json  CLI 表面清理与命名统一
│   ├── FT-028.json  死代码与历史包袱清理
│   ├── FT-029.json  God file 拆分重构
│   ├── FT-030.json  重复逻辑与 API 设计收敛
│   ├── FT-031.json  CLI 核心测试覆盖
│   └── FT-032.json  文档同步
└── stories/
    ├── US-039.json ~ US-044.json  (FT-027)
    ├── US-045.json ~ US-046.json  (FT-028)
    ├── US-047.json ~ US-050.json  (FT-029)
    ├── US-051.json ~ US-057.json  (FT-030)
    ├── US-058.json ~ US-061.json  (FT-031)
    └── US-062.json ~ US-064.json  (FT-032)
```

报告本身在仓库根 `REVIEW_FIXES_PLAN.md`，可删除或转 docs/。

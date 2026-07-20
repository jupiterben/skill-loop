# Story 偏好 Agent（preferredTool）设计

日期：2026-07-20  
状态：已确认

## 目标

为每个 Story 配置偏好执行工具（agent / claude / codex / cursor）。外循环认领该 Story 时优先使用其偏好工具；未设置或不可用时按回退链选择。

## 非目标（首版）

- CLI 设置偏好工具
- 脑图节点展示 agent 徽章
- Story 面板「一键启动该 Story」
- 按 tool 路由不同 worker

## 数据模型

在 `UserStory` 上新增可选字段：

```ts
preferredTool?: "agent" | "claude" | "codex" | "cursor" | null;
```

约定：

- 缺省或 `null`：未指定，走回退链
- 合法值与外循环 `LOOP_RUN_TOOLS` / `VALID_TOOLS` 一致：`agent` | `claude` | `codex` | `cursor`
- 修改 `preferredTool` **不**触发需求变更副作用（不重置 `passes`、不强制改 `status`、不写 progress）
- 已归档 Story 不可修改

## 工具解析链

新增 `resolveStoryTool(story, runPreferred?)`（或等价函数），在 worker 认领 Story 后、调用 AI 工具前执行：

1. 若 Story 有 `preferredTool` 且本机可用 → 使用之
2. 否则若本次外循环全局 `--tool` / Dashboard 启动 tool 可用 → 使用之
3. 否则本机自动探测（现有顺序：agent → claude → codex）
4. 全部不可用 → 抛错（与现有 `resolveRunTool` 行为一致）

「可用」判定复用现有 `commandExists` 逻辑（含 `cursor` → `agent` 映射）。

### 调用点

- `runWorkerIteration`：按**当前 Story**解析实际 tool，不再假设整次 run 固定单一 tool
- `db.startRun`、`initRunLive`、worker run-state 记录的是**解析后的实际 tool**

并行 workers 下，不同 Story 可使用不同 CLI；这是预期行为。

## Dashboard UI

仅在 Story 属性面板（`NodePropsPanel`）配置：

- 字段标签：**Agent**
- 控件：`Select`，选项为 `未指定` | `agent` | `claude` | `codex` | `cursor`
- 变更即时保存（对齐 Milestone / 优先级的即时写入模式，不并入「保存 Story」大表单）
- 首版不在脑图节点显示工具徽章

## API

```
POST /api/stories/preferred-tool
body: { storyId: string, preferredTool: string | null }
```

- `preferredTool` 为 `null`、空串或省略清空字段 → 存为未指定
- 非法值 → 400 / 抛错
- 后端：`db.setStoryPreferredTool(projectName, storyId, preferredTool)`
- 前端：`api.setStoryPreferredTool`；成功后刷新 Dashboard 数据

## 测试

1. **resolveStoryTool**
   - 偏好可用 → 用偏好
   - 偏好不可用 → 回退全局 run tool
   - 全局也不可用 → 回退自动探测
   - 全失败 → 抛错
2. **setStoryPreferredTool**
   - 合法写入、清空、非法值报错、归档拒绝
   - 修改后 passes/status 不变、无 progress 条目
3. **API / UI 契约**
   - 存在 `/api/stories/preferred-tool` 与面板 Agent Select（源码断言，风格对齐现有 feature 测试）
4. **外循环集成**
   - 认领带偏好的 Story 后，`startRun` / run-live 中的 tool 为解析结果

## 错误处理

- 非法 `preferredTool`：保存时拒绝
- 运行时偏好不可用：静默回退（不因偏好缺失而跳过 Story）
- 回退链耗尽：该轮失败并记录，与现有无工具行为一致

## 决策摘要

| 项 | 选择 |
|----|------|
| 能力形态 | 每 Story 持久化偏好工具 |
| 未设置回退 | 全局 run tool → 自动探测 |
| 偏好不可用 | 同一回退链 |
| 配置入口 | 仅 Dashboard Story 属性面板 |
| 实现方式 | Story 字段 `preferredTool` + 专用 API |

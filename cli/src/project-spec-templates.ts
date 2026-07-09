export interface ProjectSpecTemplate {
  id: string;
  title: string;
  description: string;
  content: string;
}

export interface ProjectSpec {
  content: string;
  templateId: string | null;
  updatedAt: string | null;
}

export const PROJECT_SPEC_TEMPLATES: ProjectSpecTemplate[] = [
  {
    id: "general",
    title: "通用工程规范",
    description: "代码质量、Git 提交、测试与文档的基础约定",
    content: `# 通用工程规范

## 代码质量
- 改动保持聚焦、最小化，避免无关重构
- 遵循既有命名、目录与抽象风格
- 公共 API 变更需同步更新调用方与文档

## Git 与提交
- 提交信息清晰说明「为什么」
- 每个 Story / 修复单独提交，便于回溯
- 不提交密钥、凭据或本地环境文件

## 测试
- 新功能与 bug 修复需有对应测试（若项目已有测试体系）
- 提交前运行项目规定的 test / lint / typecheck

## 文档
- 非显而易见的业务逻辑才加注释
- 用户可见行为变化更新 README 或相关说明
`,
  },
  {
    id: "typescript-react",
    title: "TypeScript / React",
    description: "前端组件、类型安全与 Vitest 测试约定",
    content: `# TypeScript / React 项目规范

## 技术栈
- TypeScript strict 模式，避免 \`any\`
- React 函数组件 + Hooks，优先组合而非继承

## 目录与组件
- 按 Feature 划分 \`components/\`、\`hooks/\`、\`lib/\`
- 共享 UI 放设计系统层，Feature 代码不互相渗透
- 样式与现有 Dashboard 风格一致（CSS 变量、Ant Design）

## 类型与 API
- 前后端共享类型定义保持一致
- API 错误统一抛出可读 message，UI 用 ErrorAlert 展示

## 测试
- 纯逻辑用 Vitest 单元测试
- 关键布局/算法（如脑图）需有回归测试
`,
  },
  {
    id: "python-backend",
    title: "Python 后端",
    description: "PEP 8、类型注解、pytest 与 API 设计",
    content: `# Python 后端项目规范

## 代码风格
- 遵循 PEP 8，使用 \`ruff\` / \`black\`（若项目已配置）
- 公开函数与方法添加类型注解
- 模块职责单一，避免巨型 \`utils.py\`

## API 设计
- REST 或 RPC 路径语义清晰，错误码与 message 一致
- 输入校验在边界层完成，业务层假设数据已合法

## 测试与部署
- 核心逻辑用 pytest，fixtures 复用测试数据
- 环境变量与密钥不入库，使用 \`.env.example\` 说明

## 日志与观测
- 结构化日志，敏感字段脱敏
- 关键路径记录 request id 便于追踪
`,
  },
  {
    id: "loop-agent",
    title: "Loop Agent 协作",
    description: "Story 驱动、Patterns 与 loop-cli 状态管理约定",
    content: `# Loop Agent 协作规范

## 迭代流程
- 每轮只实现一个 Story，完成后再 \`loop complete\`
- 编码前先 \`loop patterns\`，发现约定用 \`loop add-pattern\`
- 状态仅通过 loop-cli 读写，不手改 \`loop-data/\` JSON

## Story 与 AC
- 所有 acceptanceCriteria（含「不应出现」反例）均须满足
- 新建 Story 默认 draft，需 \`confirm-story\` 后才可执行
- Bug 用 \`loop bug US-xxx "描述"\` 记录，不单独建 Bug 实体

## Feature 规划
- 叶子 FT（无子 Feature）必须至少包含 1 个 US，否则不可执行
- 父级 FT 可作为分类容器，但其子树必须最终通向可执行 US
- 空叶子 FT 用 \`loop delete-feature FT-xxx\` 清理，或在 Dashboard 补 US

## 质量与提交
- 提交格式：\`feat: [US-xxx] - 标题\` 或 \`fix: [US-xxx] - 标题\`
- 并行 worker 按 Feature 隔离文件，减少 merge 冲突
- 全部 Story 完成且 \`loop status\` 中 \`isComplete\` 为 true 才输出 COMPLETE
`,
  },
];

export function getProjectSpecTemplate(id: string): ProjectSpecTemplate | undefined {
  return PROJECT_SPEC_TEMPLATES.find((t) => t.id === id);
}

export function emptyProjectSpec(): ProjectSpec {
  return { content: "", templateId: null, updatedAt: null };
}

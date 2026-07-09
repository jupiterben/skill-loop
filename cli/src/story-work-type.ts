export const STORY_WORK_TYPES = [
  "implementation",
  "documentation",
  "planning",
  "testing",
  "refactor",
] as const;

export type StoryWorkType = (typeof STORY_WORK_TYPES)[number];

export const STORY_WORK_TYPE_LABELS: Record<StoryWorkType, string> = {
  implementation: "代码实现",
  documentation: "文档补全",
  planning: "规划/PRD",
  testing: "测试补充",
  refactor: "重构",
};

const DESCRIPTION_TYPE_MAP: Record<string, StoryWorkType> = {
  代码实现: "implementation",
  文档补全: "documentation",
  "规划/PRD": "planning",
  规划: "planning",
  测试补充: "testing",
  重构: "refactor",
};

export const DEFAULT_STORY_WORK_TYPE: StoryWorkType = "implementation";

export function inferWorkTypeFromDescription(
  description: string
): StoryWorkType | null {
  const match = description.match(/类型[：:]\s*([^\n。]+)/);
  if (!match) return null;
  let label = match[1].trim();
  label = label.replace(/（[^）]*）$/, "").replace(/\([^)]*\)$/, "").trim();
  return DESCRIPTION_TYPE_MAP[label] ?? null;
}

export function normalizeStoryWorkType(
  raw: StoryWorkType | undefined | null,
  description?: string
): StoryWorkType {
  if (raw && STORY_WORK_TYPES.includes(raw)) return raw;
  const inferred = description ? inferWorkTypeFromDescription(description) : null;
  return inferred ?? DEFAULT_STORY_WORK_TYPE;
}

export function isStoryWorkType(value: string): value is StoryWorkType {
  return (STORY_WORK_TYPES as readonly string[]).includes(value);
}

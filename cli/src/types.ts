export interface Milestone {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
}

export interface Feature {
  id: string;
  parentId: string | null;
  title: string;
  description: string;
  sortOrder: number;
}

export type StoryStatus = "draft" | "ready";

export interface UserStory {
  id: string;
  milestoneId: string | null;
  parentId: string | null;
  dependsOn: string[];
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number;
  passes: boolean;
  /** 曾经完成过（修改需求后 passes 会重置，此标记保留） */
  everCompleted?: boolean;
  /** draft：待用户确认；ready：可被 next / 外循环执行 */
  status: StoryStatus;
  notes: string;
  sortOrder: number;
  /** 用户标记Story为待删除（代码待回滚） */
  removalRequestedAt: string | null;
  /** 已从脑图/PRD 归档，进度保留 */
  archivedAt: string | null;
}

export type TreeNodeKind = "feature" | "story";

export interface TreeNode {
  kind: TreeNodeKind;
  id: string;
  title: string;
  description: string;
  priority?: number;
  passes?: boolean;
  status?: StoryStatus;
  dependsOn?: string[];
  blocked?: boolean;
  draft?: boolean;
  removalRequested?: boolean;
  sortOrder: number;
  /** Story 的 Milestone 标签（仅 kind=story） */
  milestoneId?: string | null;
  milestoneTitle?: string | null;
  children: TreeNode[];
}

export interface StoryDependency {
  from: string;
  to: string;
}

export interface Prd {
  project: string;
  branchName: string;
  description: string;
  milestones: Milestone[];
  features: Feature[];
  userStories: UserStory[];
}

export interface ProgressEntry {
  id?: number;
  storyId: string | null;
  entryDate: string;
  summary: string;
  learnings: string[];
}

export interface LoopRun {
  id?: number;
  iteration: number;
  tool: string | null;
  storyId?: string | null;
  status: "running" | "completed" | "failed" | "max_iterations";
  message: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface ProjectStatus {
  project: string;
  branchName: string;
  description: string;
  totalStories: number;
  completedStories: number;
  pendingStories: number;
  readyStories: number;
  draftStories: number;
  blockedStories: number;
  totalFeatures: number;
  totalMilestones: number;
  isComplete: boolean;
  nextStory: UserStory | null;
  /** 外循环 activeRun 正在执行的 Story */
  currentStory: UserStory | null;
  patterns: string[];
  activeRun: LoopRun | null;
  lastProgress: ProgressEntry | null;
}

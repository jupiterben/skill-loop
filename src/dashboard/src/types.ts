import type { AgentConfig } from "../../domain/agent-config";
import type { RunTool } from "../../domain/run-tool";
export type { AgentConfig, AgentProfile } from "../../domain/agent-config";

export interface Milestone {
  id: string;
  title: string;
  description: string;
  /** ISO 日期字符串，如 2026-07-15 */
  targetDate?: string;
  /** 版本标签，如 v0.1 */
  version?: string;
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

export type StoryWorkType =
  | "implementation"
  | "documentation"
  | "planning"
  | "testing"
  | "refactor";

export type PreferredTool = "agent" | "claude" | "codex" | "cursor";

export interface UserStory {
  id: string;
  milestoneId: string | null;
  parentId: string | null;
  dependsOn: string[];
  title: string;
  description: string;
  workType: StoryWorkType;
  acceptanceCriteria: string[];
  priority: number;
  passes: boolean;
  everCompleted?: boolean;
  status: StoryStatus;
  notes: string;
  sortOrder: number;
  removalRequestedAt: string | null;
  archivedAt: string | null;
  claimedBy?: string | null;
  claimedAt?: string | null;
  /** 外循环执行该 Story 时的偏好工具；null/缺省 = 未指定 */
  preferredTool?: PreferredTool | null;
  agentProfileId?: string | null;
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
  milestoneId?: string | null;
  milestoneTitle?: string | null;
  workType?: StoryWorkType;
  children: TreeNode[];
}

export interface StoryDependency {
  from: string;
  to: string;
}

export type SelectedMindMapNode = {
  id: string;
  kind:
    | "root"
    | "feature"
    | "story"
    | "draft"
    | "done"
    | "blocked"
    | "pending_removal"
    | "archived";
};

export interface ProgressEntry {
  id?: number;
  storyId: string | null;
  entryDate: string;
  summary: string;
  learnings: string[];
}

export type RunLivePhase = "starting" | "invoking" | "between" | "done";

export interface RunLiveState {
  agentProfileId?: string | null;
  agentProfileName?: string | null;
  model?: string | null;
  workerId?: string;
  iteration: number;
  storyId: string | null;
  tool: string;
  phase: RunLivePhase;
  output: string;
  updatedAt: string;
}

export interface LoopRun {
  agentProfileId?: string | null;
  agentProfileName?: string | null;
  model?: string | null;
  id?: number;
  iteration: number;
  tool: string | null;
  storyId?: string | null;
  workerId?: string | null;
  status: "running" | "completed" | "failed" | "max_iterations";
  message: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface ProjectStatus {
  project: string;
  branchName: string;
  description: string;
  vision?: string;
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
  currentStory: UserStory | null;
  patterns: string[];
  activeRun: LoopRun | null;
  activeRuns?: LoopRun[];
  lastProgress: ProgressEntry | null;
}

export interface ProjectSpec {
  content: string;
  templateId: string | null;
  updatedAt: string | null;
}

export interface ProjectSpecTemplate {
  id: string;
  title: string;
  description: string;
  content: string;
}

export interface DashboardData {
  agentConfig?: AgentConfig;
  installedAgentTools?: RunTool[];
  projectName: string;
  projectRoot?: string;
  status: ProjectStatus;
  loopRunner?: {
    running: boolean;
    stopRequested: boolean;
    coordinator?: {
      workers?: number;
      workerIds?: string[];
      tool?: string;
    } | null;
    state: {
      agentProfileName?: string | null;
      model?: string | null;
      tool?: string;
      iteration?: number;
      currentStoryId?: string | null;
      workerId?: string;
    } | null;
    workers?: {
      tool?: string;
      iteration?: number;
      currentStoryId?: string | null;
      workerId?: string;
    }[];
  };
  runLive?: RunLiveState | null;
  runLiveWorkers?: RunLiveState[];
  milestones: Milestone[];
  features: Feature[];
  userStories: UserStory[];
  archivedStories: UserStory[];
  tree: TreeNode[];
  dependencies: StoryDependency[];
  patterns: string[];
  projectSpec: ProjectSpec;
  projectSpecTemplates: ProjectSpecTemplate[];
  progress: ProgressEntry[];
  runs: LoopRun[];
}

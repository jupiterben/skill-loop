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
  everCompleted?: boolean;
  status: StoryStatus;
  notes: string;
  sortOrder: number;
  removalRequestedAt: string | null;
  archivedAt: string | null;
  claimedBy?: string | null;
  claimedAt?: string | null;
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
  workerId?: string;
  iteration: number;
  storyId: string | null;
  tool: string;
  phase: RunLivePhase;
  output: string;
  updatedAt: string;
}

export interface LoopRun {
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
  projectName: string;
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

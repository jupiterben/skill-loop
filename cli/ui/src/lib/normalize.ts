import type {
  DashboardData,
  Feature,
  Milestone,
  ProjectStatus,
  RunLiveState,
  StoryDependency,
  TreeNode,
  UserStory,
} from "../types";

function isStoryReady(story: UserStory, stories: UserStory[]): boolean {
  if (story.passes || story.status !== "ready") return false;
  const byId = new Map(stories.map((s) => [s.id, s]));
  return (story.dependsOn ?? []).every((depId) => byId.get(depId)?.passes === true);
}

function buildDependencies(stories: UserStory[]): StoryDependency[] {
  const ids = new Set(stories.map((s) => s.id));
  const deps: StoryDependency[] = [];
  for (const s of stories) {
    for (const from of s.dependsOn ?? []) {
      if (ids.has(from)) deps.push({ from, to: s.id });
    }
  }
  return deps;
}

function buildTree(
  features: Feature[],
  stories: UserStory[],
  milestones: Milestone[] = []
): TreeNode[] {
  const milestoneById = new Map(milestones.map((m) => [m.id, m]));
  const featureById = new Map(features.map((f) => [f.id, f]));
  const storiesByParent = new Map<string | null, UserStory[]>();
  const featuresByParent = new Map<string | null, Feature[]>();

  for (const f of features) {
    const pKey = f.parentId;
    if (!featuresByParent.has(pKey)) featuresByParent.set(pKey, []);
    featuresByParent.get(pKey)!.push(f);
  }

  for (const s of stories) {
    const pKey = s.parentId;
    if (!storiesByParent.has(pKey)) storiesByParent.set(pKey, []);
    storiesByParent.get(pKey)!.push(s);
  }

  const sortFeatures = (list: Feature[]) =>
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  const sortStories = (list: UserStory[]) =>
    list.sort(
      (a, b) =>
        a.priority - b.priority ||
        a.sortOrder - b.sortOrder ||
        a.id.localeCompare(b.id)
    );

  function featureNode(f: Feature): TreeNode {
    const childFeatures = sortFeatures(featuresByParent.get(f.id) ?? []);
    const childStories = sortStories(storiesByParent.get(f.id) ?? []);
    return {
      kind: "feature",
      id: f.id,
      title: f.title,
      description: f.description,
      sortOrder: f.sortOrder,
      children: [
        ...childFeatures.map(featureNode),
        ...childStories.map(storyNode),
      ],
    };
  }

  function storyNode(s: UserStory): TreeNode {
    const ready = isStoryReady(s, stories);
    const ms = s.milestoneId ? milestoneById.get(s.milestoneId) : undefined;
    const draft = !s.passes && s.status === "draft";
    return {
      kind: "story",
      id: s.id,
      title: s.title,
      description: s.description,
      priority: s.priority,
      passes: s.passes,
      status: s.status,
      dependsOn: s.dependsOn,
      draft,
      blocked: !s.passes && s.status === "ready" && !ready,
      removalRequested: Boolean(s.removalRequestedAt && !s.archivedAt),
      sortOrder: s.sortOrder,
      milestoneId: s.milestoneId,
      milestoneTitle: ms?.title ?? null,
      children: [],
    };
  }

  const roots: TreeNode[] = [
    ...sortFeatures(featuresByParent.get(null) ?? []).map(featureNode),
    ...sortStories(storiesByParent.get(null) ?? []).map(storyNode),
  ];

  for (const s of stories) {
    if (s.parentId && !featureById.has(s.parentId)) {
      if (!roots.some((r) => r.kind === "story" && r.id === s.id)) {
        roots.push(storyNode(s));
      }
    }
  }

  return roots;
}

function normalizeStory(raw: Record<string, unknown>, index: number): UserStory {
  return {
    id: String(raw.id ?? `US-${index + 1}`),
    milestoneId: (raw.milestoneId as string | null) ?? null,
    parentId: (raw.parentId as string | null) ?? null,
    dependsOn: Array.isArray(raw.dependsOn) ? (raw.dependsOn as string[]) : [],
    title: String(raw.title ?? ""),
    description: String(raw.description ?? ""),
    acceptanceCriteria: Array.isArray(raw.acceptanceCriteria)
      ? (raw.acceptanceCriteria as string[])
      : [],
    priority: Number(raw.priority ?? index + 1),
    passes: Boolean(raw.passes),
    everCompleted: Boolean(raw.everCompleted ?? raw.passes),
    status: (raw.status as UserStory["status"]) ?? "ready",
    notes: String(raw.notes ?? ""),
    sortOrder: Number(raw.sortOrder ?? index),
    removalRequestedAt: (raw.removalRequestedAt as string | null) ?? null,
    archivedAt: (raw.archivedAt as string | null) ?? null,
  };
}

function normalizeFeature(raw: Record<string, unknown>, index: number): Feature {
  return {
    id: String(raw.id ?? `FT-${index + 1}`),
    parentId: (raw.parentId as string | null) ?? null,
    title: String(raw.title ?? ""),
    description: String(raw.description ?? ""),
    sortOrder: Number(raw.sortOrder ?? index),
  };
}

export function normalizeDashboard(raw: Record<string, unknown>): DashboardData {
  const status = (raw.status ?? {}) as Record<string, unknown>;

  const milestones = Array.isArray(raw.milestones)
    ? (raw.milestones as Milestone[])
    : [];

  const features = Array.isArray(raw.features)
    ? (raw.features as Record<string, unknown>[]).map(normalizeFeature)
    : [];

  const rawStories = Array.isArray(raw.userStories)
    ? raw.userStories
    : Array.isArray(raw.stories)
      ? raw.stories
      : [];

  const userStories = rawStories.map((s, i) =>
    normalizeStory(s as Record<string, unknown>, i)
  );

  const archivedStories = Array.isArray(raw.archivedStories)
    ? (raw.archivedStories as Record<string, unknown>[]).map(normalizeStory)
    : userStories.filter((s) => s.archivedAt);

  const activeStories = userStories.filter((s) => !s.archivedAt);

  const tree = buildTree(features, activeStories, milestones);

  const dependencies = Array.isArray(raw.dependencies)
    ? (raw.dependencies as StoryDependency[])
    : buildDependencies(activeStories);

  const pending = activeStories.filter((s) => !s.passes);
  const draft = pending.filter((s) => s.status === "draft").length;
  const ready = pending.filter((s) => isStoryReady(s, userStories)).length;

  const activeRun = (status.activeRun as ProjectStatus["activeRun"]) ?? null;
  let currentStory = (status.currentStory as UserStory | null) ?? null;
  if (!currentStory && activeRun?.storyId) {
    currentStory =
      activeStories.find((s) => s.id === activeRun.storyId) ??
      userStories.find((s) => s.id === activeRun.storyId) ??
      null;
  }

  const normalizedStatus: ProjectStatus = {
    project: String(status.project ?? "—"),
    branchName: String(status.branchName ?? "—"),
    description: String(status.description ?? ""),
    totalStories: Number(status.totalStories ?? activeStories.length),
    completedStories: Number(
      status.completedStories ?? activeStories.filter((s) => s.passes).length
    ),
    pendingStories: Number(status.pendingStories ?? pending.length),
    readyStories: Number(status.readyStories ?? ready),
    draftStories: Number(status.draftStories ?? draft),
    blockedStories: Number(
      status.blockedStories ?? pending.length - ready - draft
    ),
    totalFeatures: Number(status.totalFeatures ?? features.length),
    totalMilestones: Number(status.totalMilestones ?? milestones.length),
    isComplete: Boolean(status.isComplete),
    nextStory: (status.nextStory as UserStory | null) ?? null,
    currentStory,
    patterns: Array.isArray(status.patterns)
      ? (status.patterns as string[])
      : Array.isArray(raw.patterns)
        ? (raw.patterns as string[])
        : [],
    activeRun: (status.activeRun as ProjectStatus["activeRun"]) ?? null,
    lastProgress: (status.lastProgress as ProjectStatus["lastProgress"]) ?? null,
  };

  return {
    projectName: String(raw.projectName ?? normalizedStatus.project),
    status: normalizedStatus,
    loopRunner: raw.loopRunner as DashboardData["loopRunner"],
    runLive: (raw.runLive as RunLiveState | null) ?? null,
    milestones,
    features,
    userStories: activeStories,
    archivedStories,
    tree,
    dependencies,
    patterns: Array.isArray(raw.patterns)
      ? (raw.patterns as string[])
      : normalizedStatus.patterns,
    progress: Array.isArray(raw.progress) ? raw.progress : [],
    runs: Array.isArray(raw.runs) ? raw.runs : [],
  };
}

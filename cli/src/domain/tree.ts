import { normalizeStoryWorkType } from "./story-work-type.js";
import type {
  Feature,
  Milestone,
  StoryDependency,
  StoryStatus,
  TreeNode,
  UserStory,
} from "./types.js";

const VALID_PREFERRED = new Set(["agent", "claude", "codex", "cursor"]);

export function normalizeUserStory(story: UserStory): UserStory {
  const raw = story as UserStory & {
    status?: StoryStatus;
    workType?: UserStory["workType"];
    preferredTool?: unknown;
  };
  const everCompleted = Boolean(raw.everCompleted ?? raw.passes);
  return {
    ...story,
    workType: normalizeStoryWorkType(raw.workType, story.description),
    status: raw.status ?? "ready",
    everCompleted,
    removalRequestedAt: story.removalRequestedAt ?? null,
    archivedAt: story.archivedAt ?? null,
    claimedBy: story.claimedBy ?? null,
    claimedAt: story.claimedAt ?? null,
    preferredTool:
      raw.preferredTool != null && VALID_PREFERRED.has(String(raw.preferredTool))
        ? (String(raw.preferredTool) as UserStory["preferredTool"])
        : null,
  };
}

export function isDraftStory(story: UserStory): boolean {
  return !story.passes && !story.archivedAt && story.status === "draft";
}

export function isActiveStory(story: UserStory): boolean {
  return !story.archivedAt;
}

export function getActiveStories(stories: UserStory[]): UserStory[] {
  return stories.filter(isActiveStory);
}

export function getArchivedStories(stories: UserStory[]): UserStory[] {
  return stories.filter((s) => Boolean(s.archivedAt));
}

export function isPendingRemoval(story: UserStory): boolean {
  return Boolean(story.removalRequestedAt && !story.archivedAt);
}

function storySort(a: UserStory, b: UserStory): number {
  return (
    a.priority - b.priority ||
    a.sortOrder - b.sortOrder ||
    a.id.localeCompare(b.id)
  );
}

export function isStoryReady(story: UserStory, allStories: UserStory[]): boolean {
  if (story.passes || story.archivedAt || story.status !== "ready") return false;
  const byId = new Map(allStories.map((s) => [s.id, s]));
  return (story.dependsOn ?? []).every((depId) => {
    const dep = byId.get(depId);
    return dep?.passes === true;
  });
}

export function wouldCreateDependencyCycle(
  stories: UserStory[],
  fromId: string,
  toId: string
): boolean {
  if (fromId === toId) return true;
  const byId = new Map(stories.map((s) => [s.id, s]));
  const visiting = new Set<string>();

  function dependsOnReachable(id: string, target: string): boolean {
    if (id === target) return true;
    if (visiting.has(id)) return false;
    visiting.add(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (dependsOnReachable(dep, target)) return true;
    }
    return false;
  }

  return dependsOnReachable(fromId, toId);
}

/** 脑图树：仅 Feature → Story；Milestone 不作为树节点，仅作 Story 标签 */
export function buildTree(
  features: Feature[],
  stories: UserStory[],
  milestones: Milestone[] = []
): TreeNode[] {
  const activeStories = getActiveStories(stories);
  const milestoneById = new Map(milestones.map((m) => [m.id, m]));
  const featureById = new Map(features.map((f) => [f.id, f]));
  const storiesByParent = new Map<string | null, UserStory[]>();
  const featuresByParent = new Map<string | null, Feature[]>();

  for (const f of features) {
    const pKey = f.parentId;
    if (!featuresByParent.has(pKey)) featuresByParent.set(pKey, []);
    featuresByParent.get(pKey)!.push(f);
  }

  for (const s of activeStories) {
    const pKey = s.parentId;
    if (!storiesByParent.has(pKey)) storiesByParent.set(pKey, []);
    storiesByParent.get(pKey)!.push(s);
  }

  const sortFeatures = (list: Feature[]) =>
    list.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
    );

  const sortStories = (list: UserStory[]) => list.sort(storySort);

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
    return {
      kind: "story",
      id: s.id,
      title: s.title,
      description: s.description,
      priority: s.priority,
      passes: s.passes,
      status: s.status,
      dependsOn: s.dependsOn,
      draft: isDraftStory(s),
      blocked: !s.passes && s.status === "ready" && !ready,
      removalRequested: isPendingRemoval(s),
      sortOrder: s.sortOrder,
      milestoneId: s.milestoneId,
      milestoneTitle: ms?.title ?? null,
      workType: s.workType,
      children: [],
    };
  }

  const roots: TreeNode[] = [
    ...sortFeatures(featuresByParent.get(null) ?? []).map(featureNode),
    ...sortStories(storiesByParent.get(null) ?? []).map(storyNode),
  ];

  for (const s of activeStories) {
    if (s.parentId && !featureById.has(s.parentId)) {
      if (!roots.some((r) => r.kind === "story" && r.id === s.id)) {
        roots.push(storyNode(s));
      }
    }
  }

  return roots;
}

export function buildStoryDependencies(stories: UserStory[]): StoryDependency[] {
  const active = getActiveStories(stories);
  const ids = new Set(active.map((s) => s.id));
  const deps: StoryDependency[] = [];
  for (const s of active) {
    for (const from of s.dependsOn ?? []) {
      if (ids.has(from)) deps.push({ from, to: s.id });
    }
  }
  return deps;
}

export function isStoryClaimed(story: UserStory): boolean {
  return Boolean(story.claimedBy?.trim());
}

export function getNextStory(stories: UserStory[]): UserStory | null {
  return getNextStories(stories, 1)[0] ?? null;
}

/** 返回最多 limit 个可并行执行的 Story（跳过已认领；removal 仍串行） */
export function getNextStories(stories: UserStory[], limit: number): UserStory[] {
  if (limit < 1) return [];
  const active = getActiveStories(stories);
  const pendingRemoval = active.filter(isPendingRemoval);
  if (pendingRemoval.length) {
    pendingRemoval.sort(storySort);
    return pendingRemoval.slice(0, 1);
  }

  const ready = active
    .filter((s) => isStoryReady(s, stories) && !isStoryClaimed(s));
  ready.sort(storySort);
  return ready.slice(0, limit);
}

export function countStories(stories: UserStory[]) {
  const active = getActiveStories(stories);
  const completed = active.filter((s) => s.passes).length;
  const pending = active.filter((s) => !s.passes);
  const draft = pending.filter((s) => s.status === "draft").length;
  const ready = pending.filter((s) => isStoryReady(s, stories)).length;
  return {
    total: active.length,
    completed,
    pending: pending.length,
    draft,
    ready,
    blocked: pending.length - ready - draft,
  };
}

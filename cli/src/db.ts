import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  readEntities,
  readJsonFile,
  writeEntity,
  writeJsonFile,
  deleteEntity,
  withStateLock,
} from "./json-fs.js";
import {
  getFeaturesDir,
  getMilestonesDir,
  getPatternsFile,
  getProgressFile,
  getProjectFile,
  getProjectSpecFile,
  getRunsFile,
  getStateDir,
  getStoriesDir,
} from "./paths.js";
import {
  buildTree,
  countStories,
  getActiveStories,
  getArchivedStories,
  getNextStory,
  getNextStories,
  isDraftStory,
  normalizeUserStory,
  wouldCreateDependencyCycle,
} from "./tree.js";
import {
  defaultFixStoryTitle,
  formatBugAc,
  hasBugAc,
  normalizeBugDescription,
} from "./bug-ac.js";
import {
  emptyProjectSpec,
  getProjectSpecTemplate,
  PROJECT_SPEC_TEMPLATES,
  type ProjectSpec,
} from "./project-spec-templates.js";
import type {
  Feature,
  LoopRun,
  Milestone,
  ProgressEntry,
  ProjectStatus,
  TreeNode,
  UserStory,
} from "./types.js";

type ProjectFile = {
  name: string;
  branchName: string;
  description: string;
  updatedAt: string;
};

type PatternsFile = { items: string[] };
type ProgressFile = { entries: ProgressEntry[]; nextId: number };
type RunsFile = { runs: LoopRun[]; nextId: number };

export class LoopStateDb {
  readonly projectRoot: string;
  readonly stateDir: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.stateDir = getStateDir(projectRoot);
  }

  close(): void {
    // 文件存储无需关闭连接
  }

  private touchProject(): void {
    const path = getProjectFile(this.projectRoot);
    const cur = readJsonFile<ProjectFile | null>(path, null);
    if (cur) {
      writeJsonFile(path, { ...cur, updatedAt: new Date().toISOString() });
    }
  }

  private assertProject(name: string): ProjectFile {
    const meta = readJsonFile<ProjectFile | null>(
      getProjectFile(this.projectRoot),
      null
    );
    if (!meta || meta.name !== name) {
      throw new Error(`项目未初始化: ${name}`);
    }
    return meta;
  }

  private nextId(prefix: string, existing: string[]): string {
    const nums = existing
      .map((id) => id.match(new RegExp(`^${prefix}-(\\d+)$`))?.[1])
      .filter(Boolean)
      .map(Number);
    const n = nums.length ? Math.max(...nums) + 1 : 1;
    return `${prefix}-${String(n).padStart(3, "0")}`;
  }

  upsertProject(input: {
    name: string;
    branchName: string;
    description: string;
  }): number {
    writeJsonFile(getProjectFile(this.projectRoot), {
      name: input.name,
      branchName: input.branchName,
      description: input.description,
      updatedAt: new Date().toISOString(),
    } satisfies ProjectFile);
    return 1;
  }

  getMilestones(_projectName: string): Milestone[] {
    return readEntities<Milestone>(getMilestonesDir(this.projectRoot)).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
    );
  }

  addMilestone(
    projectName: string,
    input: Omit<Milestone, "id" | "sortOrder"> & {
      id?: string;
      sortOrder?: number;
    }
  ): Milestone {
    this.assertProject(projectName);
    const existing = this.getMilestones(projectName);
    const id = input.id ?? this.nextId("MS", existing.map((m) => m.id));
    const sortOrder =
      input.sortOrder ??
      (existing.length ? Math.max(...existing.map((m) => m.sortOrder)) + 1 : 0);

    const milestone: Milestone = {
      id,
      title: input.title,
      description: input.description ?? "",
      sortOrder,
    };
    writeEntity(getMilestonesDir(this.projectRoot), milestone);
    this.touchProject();
    return milestone;
  }

  updateMilestone(
    projectName: string,
    milestoneId: string,
    patch: { title?: string; description?: string }
  ): Milestone {
    this.assertProject(projectName);
    const existing = this.getMilestones(projectName);
    const cur = existing.find((m) => m.id === milestoneId);
    if (!cur) throw new Error(`找不到 Milestone: ${milestoneId}`);

    if (patch.title !== undefined && !patch.title.trim()) {
      throw new Error("title 不能为空");
    }

    const updated: Milestone = {
      ...cur,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description }
        : {}),
    };
    writeEntity(getMilestonesDir(this.projectRoot), updated);
    this.touchProject();
    return updated;
  }

  private assertMilestone(projectName: string, milestoneId: string): void {
    if (!this.getMilestones(projectName).some((m) => m.id === milestoneId)) {
      throw new Error(`找不到 Milestone: ${milestoneId}`);
    }
  }

  getFeatures(_projectName: string): Feature[] {
    return readEntities<Feature & { milestoneId?: unknown }>(
      getFeaturesDir(this.projectRoot)
    )
      .map(({ milestoneId: _drop, ...f }) => f)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  }

  addFeature(
    projectName: string,
    input: Omit<Feature, "id" | "sortOrder"> & {
      id?: string;
      sortOrder?: number;
    }
  ): Feature {
    this.assertProject(projectName);
    const features = this.getFeatures(projectName);

    if (input.parentId) {
      const parent = features.find((f) => f.id === input.parentId);
      if (!parent) throw new Error(`找不到父 Feature: ${input.parentId}`);
    }

    const siblings = features.filter(
      (f) => f.parentId === (input.parentId ?? null)
    );
    const id = input.id ?? this.nextId("FT", features.map((f) => f.id));
    const sortOrder =
      input.sortOrder ??
      (siblings.length ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0);

    const feature: Feature = {
      id,
      parentId: input.parentId ?? null,
      title: input.title,
      description: input.description ?? "",
      sortOrder,
    };
    writeEntity(getFeaturesDir(this.projectRoot), feature);
    this.touchProject();
    return feature;
  }

  updateFeature(
    projectName: string,
    featureId: string,
    patch: { title?: string; description?: string }
  ): Feature {
    this.assertProject(projectName);
    const features = this.getFeatures(projectName);
    const cur = features.find((f) => f.id === featureId);
    if (!cur) throw new Error(`找不到 Feature: ${featureId}`);

    if (patch.title !== undefined && !patch.title.trim()) {
      throw new Error("title 不能为空");
    }

    const updated: Feature = {
      ...cur,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description }
        : {}),
    };
    writeEntity(getFeaturesDir(this.projectRoot), updated);
    this.touchProject();
    return updated;
  }

  reorderFeature(
    projectName: string,
    featureId: string,
    direction: "up" | "down"
  ): Feature {
    this.assertProject(projectName);
    const features = this.getFeatures(projectName);
    const cur = features.find((f) => f.id === featureId);
    if (!cur) throw new Error(`找不到 Feature: ${featureId}`);

    const siblings = features
      .filter((f) => f.parentId === cur.parentId)
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
      );
    const idx = siblings.findIndex((f) => f.id === featureId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) {
      throw new Error("无法移动");
    }

    const other = siblings[swapIdx]!;
    const curOrder = cur.sortOrder;
    const otherOrder = other.sortOrder;

    writeEntity(getFeaturesDir(this.projectRoot), {
      ...cur,
      sortOrder: otherOrder,
    });
    writeEntity(getFeaturesDir(this.projectRoot), {
      ...other,
      sortOrder: curOrder,
    });
    this.touchProject();
    return { ...cur, sortOrder: otherOrder };
  }

  reorderStory(
    projectName: string,
    storyId: string,
    direction: "up" | "down"
  ): UserStory {
    this.assertProject(projectName);
    const stories = this.getActiveStories(projectName);
    const cur = stories.find((s) => s.id === storyId);
    if (!cur) throw new Error(`找不到 UserStory: ${storyId}`);

    const siblings = [...stories]
      .filter((s) => s.parentId === cur.parentId)
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          a.sortOrder - b.sortOrder ||
          a.id.localeCompare(b.id)
      );
    const idx = siblings.findIndex((s) => s.id === storyId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) {
      throw new Error("无法移动");
    }

    const other = siblings[swapIdx]!;
    const updatedCur: UserStory = {
      ...cur,
      priority: other.priority,
      sortOrder: other.sortOrder,
    };
    const updatedOther: UserStory = {
      ...other,
      priority: cur.priority,
      sortOrder: cur.sortOrder,
    };

    writeEntity(getStoriesDir(this.projectRoot), updatedCur);
    writeEntity(getStoriesDir(this.projectRoot), updatedOther);
    this.touchProject();
    return updatedCur;
  }

  moveMindMapItem(
    projectName: string,
    input: { id: string; kind: "feature" | "story"; parentId: string | null }
  ): Feature | UserStory {
    if (input.kind === "feature") {
      return this.moveFeature(projectName, input.id, input.parentId);
    }
    return this.moveStory(projectName, input.id, input.parentId);
  }

  moveFeature(
    projectName: string,
    featureId: string,
    parentId: string | null
  ): Feature {
    this.assertProject(projectName);
    const features = this.getFeatures(projectName);
    const cur = features.find((f) => f.id === featureId);
    if (!cur) throw new Error(`找不到 Feature: ${featureId}`);

    const nextParentId = parentId ?? null;
    if (nextParentId === cur.parentId) return cur;
    if (nextParentId === featureId) {
      throw new Error("不能将 Feature 移动到自身下");
    }

    if (nextParentId) {
      const parent = features.find((f) => f.id === nextParentId);
      if (!parent) throw new Error(`找不到父 Feature: ${nextParentId}`);
      const subtreeIds = new Set(
        this.collectFeatureSubtreeIds(featureId, features)
      );
      if (subtreeIds.has(nextParentId)) {
        throw new Error("不能将 Feature 移动到其子节点下");
      }
    }

    const siblings = features.filter((f) => f.parentId === nextParentId);
    const sortOrder = siblings.length
      ? Math.max(...siblings.map((f) => f.sortOrder)) + 1
      : 0;

    const updated: Feature = { ...cur, parentId: nextParentId, sortOrder };
    writeEntity(getFeaturesDir(this.projectRoot), updated);
    this.touchProject();
    return updated;
  }

  moveStory(
    projectName: string,
    storyId: string,
    parentId: string | null
  ): UserStory {
    this.assertProject(projectName);
    const stories = this.getStories(projectName);
    const cur = stories.find((s) => s.id === storyId);
    if (!cur) throw new Error(`找不到 UserStory: ${storyId}`);
    if (cur.archivedAt) throw new Error("已归档 Story 无法移动");

    const nextParentId = parentId ?? null;
    if (nextParentId === cur.parentId) return cur;

    const features = this.getFeatures(projectName);
    if (nextParentId) {
      const parent = features.find((f) => f.id === nextParentId);
      if (!parent) throw new Error(`找不到父 Feature: ${nextParentId}`);
    } else if (cur.milestoneId) {
      this.assertMilestone(projectName, cur.milestoneId);
    }

    const siblings = getActiveStories(stories).filter(
      (s) => s.parentId === nextParentId && s.id !== storyId
    );
    const sortOrder = siblings.length
      ? Math.max(...siblings.map((s) => s.sortOrder)) + 1
      : 0;
    const priority = siblings.length
      ? Math.max(...siblings.map((s) => s.priority)) + 1
      : cur.priority;

    const updated: UserStory = {
      ...cur,
      parentId: nextParentId,
      sortOrder,
      priority,
    };
    writeEntity(getStoriesDir(this.projectRoot), updated);
    this.touchProject();
    return updated;
  }

  private collectFeatureSubtreeIds(
    featureId: string,
    features: Feature[]
  ): string[] {
    const ids = [featureId];
    for (const child of features.filter((f) => f.parentId === featureId)) {
      ids.push(...this.collectFeatureSubtreeIds(child.id, features));
    }
    return ids;
  }

  deleteFeature(projectName: string, featureId: string): string[] {
    this.assertProject(projectName);
    const features = this.getFeatures(projectName);
    if (!features.some((f) => f.id === featureId)) {
      throw new Error(`找不到 Feature: ${featureId}`);
    }

    const subtreeIds = new Set(
      this.collectFeatureSubtreeIds(featureId, features)
    );
    const stories = this.getStories(projectName);
    const hasStory = getActiveStories(stories).some(
      (s) => s.parentId && subtreeIds.has(s.parentId)
    );
    if (hasStory) {
      throw new Error("该 Feature 子树内仍有 Story，无法删除");
    }

    const dir = getFeaturesDir(this.projectRoot);
    for (const id of subtreeIds) {
      deleteEntity(dir, id);
    }
    this.touchProject();
    return [...subtreeIds];
  }

  private storyHasProgress(storyId: string): boolean {
    const file = readJsonFile<ProgressFile>(getProgressFile(this.projectRoot), {
      entries: [],
      nextId: 1,
    });
    return file.entries.some((e) => e.storyId === storyId);
  }

  private storyEverCompleted(story: UserStory): boolean {
    if (Boolean(story.everCompleted || story.passes)) return true;
    const file = readJsonFile<ProgressFile>(getProgressFile(this.projectRoot), {
      entries: [],
      nextId: 1,
    });
    return file.entries.some(
      (e) =>
        e.storyId === story.id &&
        e.summary.includes("原已完成状态已重置")
    );
  }

  private assertNoActiveDependents(
    projectName: string,
    storyId: string,
    action: string
  ): void {
    const dependents = getActiveStories(this.getStories(projectName)).filter(
      (s) => s.dependsOn.includes(storyId)
    );
    if (dependents.length) {
      const ids = dependents.map((s) => s.id).join(", ");
      throw new Error(`仍有 Story 依赖此项（${ids}），无法${action}`);
    }
  }

  deleteStory(projectName: string, storyId: string): void {
    this.assertProject(projectName);
    const stories = this.getStories(projectName);
    const story = stories.find((s) => s.id === storyId);
    if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
    if (story.archivedAt) {
      throw new Error("已归档 Story 请使用永久删除");
    }
    if (story.passes) {
      throw new Error("已完成的 Story 请标记等待删除");
    }
    if (this.storyHasProgress(storyId)) {
      throw new Error("有进度记录的 Story 请归档，不能硬删");
    }

    for (const other of stories) {
      if (!other.dependsOn.includes(storyId)) continue;
      const updated = {
        ...other,
        dependsOn: other.dependsOn.filter((d) => d !== storyId),
      };
      writeEntity(getStoriesDir(this.projectRoot), updated);
    }

    deleteEntity(getStoriesDir(this.projectRoot), storyId);
    this.touchProject();
  }

  requestStoryRemoval(
    projectName: string,
    storyId: string,
    reason?: string
  ): { story: UserStory; progressEntry: ProgressEntry } {
    this.assertProject(projectName);
    const story = this.getStories(projectName).find((s) => s.id === storyId);
    if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
    if (story.archivedAt) throw new Error("Story 已归档");
    const everCompleted = this.storyEverCompleted(story);
    if (!everCompleted) {
      throw new Error("仅曾经完成过的 Story 可标记等待删除");
    }
    if (story.removalRequestedAt) {
      throw new Error("Story 已在等待删除");
    }
    this.assertNoActiveDependents(projectName, storyId, "标记删除");

    const updated: UserStory = {
      ...story,
      removalRequestedAt: new Date().toISOString(),
    };
    writeEntity(getStoriesDir(this.projectRoot), updated);
    this.touchProject();

    const note = reason?.trim();
    const progressEntry = this.appendProgress(projectName, {
      storyId,
      entryDate: new Date().toISOString().slice(0, 10),
      summary: note
        ? `用户请求删除：${note}`
        : `用户请求删除 ${storyId}，待回滚代码`,
      learnings: [],
    });
    return { story: updated, progressEntry };
  }

  cancelStoryRemoval(
    projectName: string,
    storyId: string
  ): { story: UserStory; progressEntry: ProgressEntry } {
    this.assertProject(projectName);
    const story = this.getStories(projectName).find((s) => s.id === storyId);
    if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
    if (story.archivedAt) throw new Error("Story 已归档");
    if (!story.removalRequestedAt) {
      throw new Error("Story 未处于等待删除状态");
    }

    const updated: UserStory = { ...story, removalRequestedAt: null };
    writeEntity(getStoriesDir(this.projectRoot), updated);
    this.touchProject();

    const progressEntry = this.appendProgress(projectName, {
      storyId,
      entryDate: new Date().toISOString().slice(0, 10),
      summary: `已取消删除 ${storyId}`,
      learnings: [],
    });
    return { story: updated, progressEntry };
  }

  archiveStory(
    projectName: string,
    storyId: string,
    reason?: string
  ): { story: UserStory; progressEntry: ProgressEntry } {
    this.assertProject(projectName);
    const story = this.getStories(projectName).find((s) => s.id === storyId);
    if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
    if (story.archivedAt) throw new Error("Story 已归档");
    this.assertNoActiveDependents(projectName, storyId, "归档");

    const hasProgress = this.storyHasProgress(storyId);
    const everCompleted = this.storyEverCompleted(story);
    if (everCompleted) {
      if (!story.removalRequestedAt) {
        throw new Error("曾经完成过的 Story 请先标记等待删除");
      }
    } else if (!hasProgress) {
      throw new Error("无进度记录的未完成 Story 请直接删除");
    }

    const updated: UserStory = {
      ...story,
      archivedAt: new Date().toISOString(),
      removalRequestedAt: null,
    };
    writeEntity(getStoriesDir(this.projectRoot), updated);
    this.touchProject();

    const note = reason?.trim();
    const progressEntry = this.appendProgress(projectName, {
      storyId,
      entryDate: new Date().toISOString().slice(0, 10),
      summary: note ?? `Story ${storyId} 已归档`,
      learnings: [],
    });
    return { story: updated, progressEntry };
  }

  restoreStory(
    projectName: string,
    storyId: string
  ): { story: UserStory; progressEntry: ProgressEntry } {
    this.assertProject(projectName);
    const story = this.getStories(projectName).find((s) => s.id === storyId);
    if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
    if (!story.archivedAt) throw new Error("Story 未归档");

    const updated: UserStory = { ...story, archivedAt: null };
    writeEntity(getStoriesDir(this.projectRoot), updated);
    this.touchProject();

    const progressEntry = this.appendProgress(projectName, {
      storyId,
      entryDate: new Date().toISOString().slice(0, 10),
      summary: `Story ${storyId} 已从回收站恢复`,
      learnings: [],
    });
    return { story: updated, progressEntry };
  }

  purgeStory(projectName: string, storyId: string): void {
    this.assertProject(projectName);
    const stories = this.getStories(projectName);
    const story = stories.find((s) => s.id === storyId);
    if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
    if (!story.archivedAt) throw new Error("仅可永久删除已归档 Story");

    for (const other of stories) {
      if (!other.dependsOn.includes(storyId)) continue;
      const updated = {
        ...other,
        dependsOn: other.dependsOn.filter((d) => d !== storyId),
      };
      writeEntity(getStoriesDir(this.projectRoot), updated);
    }

    deleteEntity(getStoriesDir(this.projectRoot), storyId);

    const progressFile = readJsonFile<ProgressFile>(
      getProgressFile(this.projectRoot),
      { entries: [], nextId: 1 }
    );
    progressFile.entries = progressFile.entries.filter(
      (e) => e.storyId !== storyId
    );
    writeJsonFile(getProgressFile(this.projectRoot), progressFile);

    this.touchProject();
  }

  getStories(_projectName: string): UserStory[] {
    return readEntities<UserStory>(getStoriesDir(this.projectRoot))
      .map(normalizeUserStory)
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          a.sortOrder - b.sortOrder ||
          a.id.localeCompare(b.id)
      );
  }

  getActiveStories(projectName: string): UserStory[] {
    return getActiveStories(this.getStories(projectName));
  }

  getArchivedStories(projectName: string): UserStory[] {
    return getArchivedStories(this.getStories(projectName));
  }

  addStory(
    projectName: string,
    story: Omit<
      UserStory,
      "id" | "passes" | "sortOrder" | "archivedAt" | "removalRequestedAt" | "status"
    > & {
      id?: string;
      passes?: boolean;
      sortOrder?: number;
      archivedAt?: string | null;
      removalRequestedAt?: string | null;
      status?: UserStory["status"];
    }
  ): UserStory {
    this.assertProject(projectName);
    const stories = this.getStories(projectName);
    const features = this.getFeatures(projectName);

    if (story.parentId) {
      const parent = features.find((f) => f.id === story.parentId);
      if (!parent) throw new Error(`找不到父 Feature: ${story.parentId}`);
    } else if (story.milestoneId) {
      this.assertMilestone(projectName, story.milestoneId);
    }

    const dependsOn = story.dependsOn ?? [];
    const storyIds = new Set(stories.map((s) => s.id));
    for (const depId of dependsOn) {
      if (!storyIds.has(depId)) throw new Error(`找不到依赖 Story: ${depId}`);
    }

    const siblings = stories.filter(
      (s) => s.parentId === (story.parentId ?? null)
    );
    const id = story.id ?? this.nextId("US", stories.map((s) => s.id));
    const sortOrder =
      story.sortOrder ??
      (siblings.length ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0);
    const priority =
      story.priority ??
      (stories.length ? Math.max(...stories.map((s) => s.priority)) + 1 : 1);

    const userStory: UserStory = {
      id,
      milestoneId: story.milestoneId ?? null,
      parentId: story.parentId ?? null,
      dependsOn,
      title: story.title,
      description: story.description,
      acceptanceCriteria: story.acceptanceCriteria,
      priority,
      passes: story.passes ?? false,
      everCompleted: story.passes ?? false,
      status: story.status ?? "draft",
      notes: story.notes ?? "",
      sortOrder,
      removalRequestedAt: story.removalRequestedAt ?? null,
      archivedAt: story.archivedAt ?? null,
    };
    writeEntity(getStoriesDir(this.projectRoot), userStory);
    this.touchProject();
    return userStory;
  }

  setStoryDependsOn(
    projectName: string,
    storyId: string,
    dependsOn: string[]
  ): UserStory {
    const stories = this.getStories(projectName);
    const story = stories.find((s) => s.id === storyId);
    if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
    if (story.archivedAt) throw new Error("已归档 Story 不能修改");

    const ids = new Set(stories.map((s) => s.id));
    for (const depId of dependsOn) {
      if (!ids.has(depId)) throw new Error(`找不到依赖 Story: ${depId}`);
      if (depId === storyId) throw new Error("Story 不能依赖自身");
    }
    for (const depId of dependsOn) {
      if (wouldCreateDependencyCycle(stories, depId, storyId)) {
        throw new Error(`依赖会形成环: ${depId} → ${storyId}`);
      }
    }

    const updated = { ...story, dependsOn };
    writeEntity(getStoriesDir(this.projectRoot), updated);
    this.touchProject();
    return updated;
  }

  addStoryDependency(
    projectName: string,
    fromId: string,
    toId: string
  ): UserStory {
    const target = this.getStories(projectName).find((s) => s.id === toId);
    if (!target) throw new Error(`找不到 UserStory: ${toId}`);
    if (target.dependsOn.includes(fromId)) return target;
    return this.setStoryDependsOn(projectName, toId, [
      ...target.dependsOn,
      fromId,
    ]);
  }

  removeStoryDependency(
    projectName: string,
    fromId: string,
    toId: string
  ): UserStory {
    const target = this.getStories(projectName).find((s) => s.id === toId);
    if (!target) throw new Error(`找不到 UserStory: ${toId}`);
    return this.setStoryDependsOn(
      projectName,
      toId,
      target.dependsOn.filter((d) => d !== fromId)
    );
  }

  completeStory(projectName: string, storyId: string, workerId?: string): UserStory {
    return withStateLock(this.stateDir, () => {
      const story = this.getStories(projectName).find((s) => s.id === storyId);
      if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
      if (story.archivedAt) throw new Error("已归档 Story 不能修改");
      if (isDraftStory(story)) {
        throw new Error("草稿 Story 须先 confirm-story 确认后才能完成");
      }
      if (
        workerId &&
        story.claimedBy &&
        story.claimedBy !== workerId
      ) {
        throw new Error(
          `Story ${storyId} 由 worker ${story.claimedBy} 认领，当前 worker ${workerId} 无权完成`
        );
      }
      const updated = {
        ...story,
        passes: true,
        everCompleted: true,
        claimedBy: null,
        claimedAt: null,
      };
      writeEntity(getStoriesDir(this.projectRoot), updated);
      this.touchProject();
      return updated;
    });
  }

  updateStory(
    projectName: string,
    storyId: string,
    patch: {
      title?: string;
      description?: string;
      acceptanceCriteria?: string[];
      changeNote?: string;
      status?: UserStory["status"];
    }
  ): { story: UserStory; progressEntry: ProgressEntry | null } {
    const story = this.getStories(projectName).find((s) => s.id === storyId);
    if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
    if (story.archivedAt) throw new Error("已归档 Story 不能修改");

    const title =
      patch.title !== undefined ? patch.title.trim() : story.title;
    const description =
      patch.description !== undefined ? patch.description : story.description;
    if (!title) throw new Error("title 不能为空");

    const titleChanged = title !== story.title;
    const descChanged = description !== story.description;
    const acChanged =
      patch.acceptanceCriteria !== undefined &&
      JSON.stringify(patch.acceptanceCriteria) !==
        JSON.stringify(story.acceptanceCriteria);
    const wasPassed = story.passes;
    const statusChanged =
      patch.status !== undefined && patch.status !== story.status;

    if (
      !titleChanged &&
      !descChanged &&
      !acChanged &&
      !wasPassed &&
      !statusChanged
    ) {
      return { story, progressEntry: null };
    }

    if (
      patch.status !== undefined &&
      patch.status !== "draft" &&
      patch.status !== "ready"
    ) {
      throw new Error("status 必须为 draft 或 ready");
    }
    if (patch.status === undefined) {
      throw new Error("保存时需指定 status（draft 或 ready）");
    }

    const updated: UserStory = {
      ...story,
      title,
      description,
      ...(patch.acceptanceCriteria !== undefined
        ? { acceptanceCriteria: patch.acceptanceCriteria }
        : {}),
      passes: false,
      everCompleted: Boolean(story.everCompleted || wasPassed || story.passes),
      status: patch.status,
    };
    writeEntity(getStoriesDir(this.projectRoot), updated);
    this.touchProject();

    const summaryParts: string[] = [];
    const note = patch.changeNote?.trim();
    if (note) summaryParts.push(note);
    else {
      summaryParts.push(
        patch.status === "ready"
          ? `需求变更：${storyId} 已保存为待实现`
          : `需求变更：${storyId} 已保存为草稿`
      );
    }
    if (titleChanged) {
      summaryParts.push(`标题：「${story.title}」→「${title}」`);
    }
    if (descChanged) {
      summaryParts.push(`描述：${description}`);
    }
    if (acChanged && patch.acceptanceCriteria) {
      summaryParts.push(`验收标准：${patch.acceptanceCriteria.join("；")}`);
    }
    if (wasPassed) {
      summaryParts.push("原已完成状态已重置");
    }

    const progressEntry = this.appendProgress(projectName, {
      storyId,
      entryDate: new Date().toISOString().slice(0, 10),
      summary: summaryParts.join("\n"),
      learnings: [],
    });

    return { story: updated, progressEntry };
  }

  /** 将缺陷写入 Story AC 反例；若源 Story 已完成则新建修复 Story */
  reportBug(
    projectName: string,
    storyId: string,
    description: string,
    opts?: {
      ready?: boolean;
      changeNote?: string;
      fixTitle?: string;
    }
  ): {
    action: "appended" | "created";
    bugAc: string;
    story: UserStory;
    createdStory?: UserStory;
    progressEntry: ProgressEntry | null;
  } {
    this.assertProject(projectName);
    const plain = normalizeBugDescription(description);
    const story = this.getStories(projectName).find((s) => s.id === storyId);
    if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
    if (story.archivedAt) throw new Error("已归档 Story 不能添加 Bug");

    const status: UserStory["status"] = opts?.ready ? "ready" : "draft";

    if (story.passes) {
      const bugAc = formatBugAc(plain, true);
      const fixTitle = opts?.fixTitle?.trim() || defaultFixStoryTitle(plain);
      const createdStory = this.addStory(projectName, {
        parentId: story.parentId,
        milestoneId: story.milestoneId,
        dependsOn: [],
        title: fixTitle,
        description: `修复 ${storyId}「${story.title}」的回归问题：${plain}`,
        acceptanceCriteria: [bugAc, "npm test 通过"],
        priority: Math.min(story.priority - 1, -1),
        notes: "",
        status,
      });
      const note =
        opts?.changeNote?.trim() ??
        `Bug 修复 Story：${createdStory.id}（关联 ${storyId}）`;
      const progressEntry = this.appendProgress(projectName, {
        storyId: createdStory.id,
        entryDate: new Date().toISOString().slice(0, 10),
        summary: note,
        learnings: [],
      });
      return {
        action: "created",
        bugAc,
        story,
        createdStory,
        progressEntry,
      };
    }

    const bugAc = formatBugAc(plain, false);
    if (hasBugAc(story.acceptanceCriteria, plain)) {
      throw new Error(`Story ${storyId} 已存在相同或相近的 Bug 反例 AC`);
    }

    const { story: updated, progressEntry } = this.updateStory(
      projectName,
      storyId,
      {
        acceptanceCriteria: [...story.acceptanceCriteria, bugAc],
        changeNote:
          opts?.changeNote?.trim() ?? `追加 Bug 反例 AC：${bugAc}`,
        status,
      }
    );

    return {
      action: "appended",
      bugAc,
      story: updated,
      progressEntry,
    };
  }

  completeStoryWithProgress(
    projectName: string,
    storyId: string,
    input: { summary: string; learnings?: string[]; workerId?: string }
  ): { story: UserStory; progressEntry: ProgressEntry } {
    const summary = input.summary.trim();
    if (!summary) throw new Error("实现说明必填");

    const story = this.completeStory(projectName, storyId, input.workerId);
    const progressEntry = this.appendProgress(projectName, {
      storyId,
      entryDate: new Date().toISOString().slice(0, 10),
      summary,
      learnings: input.learnings ?? [],
    });
    return { story, progressEntry };
  }

  getNextStory(projectName: string): UserStory | null {
    return getNextStory(this.getStories(projectName));
  }

  getNextStories(projectName: string, limit: number): UserStory[] {
    return getNextStories(this.getStories(projectName), limit);
  }

  claimStory(
    projectName: string,
    storyId: string,
    workerId: string
  ): UserStory {
    return withStateLock(this.stateDir, () => {
      const stories = this.getStories(projectName);
      const story = stories.find((s) => s.id === storyId);
      if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
      if (story.archivedAt) throw new Error("已归档 Story 不能认领");
      if (story.passes) throw new Error("已完成的 Story 不能认领");
      if (isDraftStory(story)) {
        throw new Error("草稿 Story 须先 confirm-story 后才能认领");
      }
      if (!getNextStories(stories, stories.length).some((s) => s.id === storyId)) {
        throw new Error(`Story ${storyId} 当前不可执行（依赖未满足或不在队列中）`);
      }
      if (story.claimedBy && story.claimedBy !== workerId) {
        throw new Error(
          `Story ${storyId} 已被 ${story.claimedBy} 认领`
        );
      }
      if (story.claimedBy === workerId) return story;

      const updated: UserStory = {
        ...story,
        claimedBy: workerId,
        claimedAt: new Date().toISOString(),
      };
      writeEntity(getStoriesDir(this.projectRoot), updated);
      this.touchProject();
      return updated;
    });
  }

  releaseClaim(
    projectName: string,
    storyId: string,
    workerId?: string
  ): UserStory {
    return withStateLock(this.stateDir, () => {
      const story = this.getStories(projectName).find((s) => s.id === storyId);
      if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
      if (!story.claimedBy) return story;
      if (workerId && story.claimedBy !== workerId) {
        throw new Error(
          `Story ${storyId} 由 ${story.claimedBy} 认领，${workerId} 无权释放`
        );
      }
      const updated: UserStory = {
        ...story,
        claimedBy: null,
        claimedAt: null,
      };
      writeEntity(getStoriesDir(this.projectRoot), updated);
      this.touchProject();
      return updated;
    });
  }

  getClaimedStory(
    projectName: string,
    workerId: string
  ): UserStory | null {
    return (
      this.getStories(projectName).find((s) => s.claimedBy === workerId) ??
      null
    );
  }

  confirmStory(projectName: string, storyId: string): UserStory {
    const story = this.getStories(projectName).find((s) => s.id === storyId);
    if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
    if (story.archivedAt) throw new Error("已归档 Story 不能修改");
    if (story.passes) throw new Error("已完成的 Story 无需确认");
    if (story.status === "ready") throw new Error("Story 已是可执行状态");

    const updated: UserStory = { ...story, status: "ready" };
    writeEntity(getStoriesDir(this.projectRoot), updated);
    this.touchProject();
    return updated;
  }

  unconfirmStory(projectName: string, storyId: string): UserStory {
    const story = this.getStories(projectName).find((s) => s.id === storyId);
    if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
    if (story.archivedAt) throw new Error("已归档 Story 不能修改");
    if (story.passes) throw new Error("已完成的 Story 不能退回草稿");
    if (story.status === "draft") throw new Error("Story 已是草稿");

    const updated: UserStory = { ...story, status: "draft" };
    writeEntity(getStoriesDir(this.projectRoot), updated);
    this.touchProject();
    return updated;
  }

  setStoryMilestone(
    projectName: string,
    storyId: string,
    milestoneId: string | null
  ): UserStory {
    const story = this.getStories(projectName).find((s) => s.id === storyId);
    if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
    if (story.archivedAt) throw new Error("已归档 Story 不能修改");
    if (milestoneId) this.assertMilestone(projectName, milestoneId);
    const updated = { ...story, milestoneId };
    writeEntity(getStoriesDir(this.projectRoot), updated);
    this.touchProject();
    return updated;
  }

  setStoryPriority(
    projectName: string,
    storyId: string,
    priority: number
  ): UserStory {
    const story = this.getStories(projectName).find((s) => s.id === storyId);
    if (!story) throw new Error(`找不到 UserStory: ${storyId}`);
    if (story.archivedAt) throw new Error("已归档 Story 不能修改");
    if (!Number.isInteger(priority) || priority < 0) {
      throw new Error("priority 必须为非负整数");
    }
    if (story.priority === priority) return story;
    const updated = { ...story, priority };
    writeEntity(getStoriesDir(this.projectRoot), updated);
    this.touchProject();
    return updated;
  }

  getTree(projectName: string): TreeNode[] {
    return buildTree(
      this.getFeatures(projectName),
      this.getStories(projectName),
      this.getMilestones(projectName)
    );
  }

  getPatterns(_projectName: string): string[] {
    return readJsonFile<PatternsFile>(getPatternsFile(this.projectRoot), {
      items: [],
    }).items;
  }

  addPattern(projectName: string, content: string): void {
    this.assertProject(projectName);
    const trimmed = content.trim();
    if (!trimmed) throw new Error("pattern 内容不能为空");
    const file = readJsonFile<PatternsFile>(getPatternsFile(this.projectRoot), {
      items: [],
    });
    file.items.push(trimmed);
    writeJsonFile(getPatternsFile(this.projectRoot), file);
    this.touchProject();
  }

  updatePattern(projectName: string, index: number, content: string): void {
    this.assertProject(projectName);
    const trimmed = content.trim();
    if (!trimmed) throw new Error("pattern 内容不能为空");
    if (!Number.isInteger(index) || index < 0) {
      throw new Error("index 必须为非负整数");
    }
    const file = readJsonFile<PatternsFile>(getPatternsFile(this.projectRoot), {
      items: [],
    });
    if (index >= file.items.length) {
      throw new Error(`无效 index: ${index}`);
    }
    file.items[index] = trimmed;
    writeJsonFile(getPatternsFile(this.projectRoot), file);
    this.touchProject();
  }

  deletePattern(projectName: string, index: number): void {
    this.assertProject(projectName);
    if (!Number.isInteger(index) || index < 0) {
      throw new Error("index 必须为非负整数");
    }
    const file = readJsonFile<PatternsFile>(getPatternsFile(this.projectRoot), {
      items: [],
    });
    if (index >= file.items.length) {
      throw new Error(`无效 index: ${index}`);
    }
    file.items.splice(index, 1);
    writeJsonFile(getPatternsFile(this.projectRoot), file);
    this.touchProject();
  }

  getProjectSpec(_projectName: string): ProjectSpec {
    return readJsonFile<ProjectSpec>(
      getProjectSpecFile(this.projectRoot),
      emptyProjectSpec()
    );
  }

  updateProjectSpec(projectName: string, content: string): ProjectSpec {
    this.assertProject(projectName);
    const spec: ProjectSpec = {
      content,
      templateId: null,
      updatedAt: new Date().toISOString(),
    };
    writeJsonFile(getProjectSpecFile(this.projectRoot), spec);
    this.touchProject();
    return spec;
  }

  applyProjectSpecTemplate(
    projectName: string,
    templateId: string,
    options?: { append?: boolean }
  ): ProjectSpec {
    this.assertProject(projectName);
    const template = getProjectSpecTemplate(templateId);
    if (!template) throw new Error(`未知模板: ${templateId}`);
    const current = this.getProjectSpec(projectName);
    const content = options?.append
      ? [current.content.trim(), template.content.trim()].filter(Boolean).join("\n\n")
      : template.content;
    const spec: ProjectSpec = {
      content,
      templateId,
      updatedAt: new Date().toISOString(),
    };
    writeJsonFile(getProjectSpecFile(this.projectRoot), spec);
    this.touchProject();
    return spec;
  }

  getProjectSpecTemplates(): typeof PROJECT_SPEC_TEMPLATES {
    return PROJECT_SPEC_TEMPLATES;
  }

  appendProgress(
    projectName: string,
    entry: Omit<ProgressEntry, "id">
  ): ProgressEntry {
    this.assertProject(projectName);
    const file = readJsonFile<ProgressFile>(getProgressFile(this.projectRoot), {
      entries: [],
      nextId: 1,
    });
    const saved: ProgressEntry = { ...entry, id: file.nextId++ };
    file.entries.push(saved);
    writeJsonFile(getProgressFile(this.projectRoot), file);
    this.touchProject();
    return saved;
  }

  getProgress(_projectName: string, limit = 20): ProgressEntry[] {
    const file = readJsonFile<ProgressFile>(getProgressFile(this.projectRoot), {
      entries: [],
      nextId: 1,
    });
    return [...file.entries].reverse().slice(0, limit);
  }

  startRun(
    projectName: string,
    iteration: number,
    tool: string | null,
    storyId?: string | null,
    workerId?: string | null
  ): LoopRun {
    this.assertProject(projectName);
    return withStateLock(this.stateDir, () => {
      const file = readJsonFile<RunsFile>(getRunsFile(this.projectRoot), {
        runs: [],
        nextId: 1,
      });
      const now = new Date().toISOString();
      for (const stale of file.runs) {
        if (stale.status !== "running") continue;
        if (workerId) {
          if (stale.workerId !== workerId) continue;
        }
        stale.status = "completed";
        stale.message = stale.message ?? "superseded by new run";
        stale.endedAt = now;
      }
      const run: LoopRun = {
        id: file.nextId++,
        iteration,
        tool,
        storyId: storyId ?? null,
        workerId: workerId ?? null,
        status: "running",
        message: null,
        startedAt: new Date().toISOString(),
        endedAt: null,
      };
      file.runs.push(run);
      writeJsonFile(getRunsFile(this.projectRoot), file);
      this.touchProject();
      return run;
    });
  }

  endRun(runId: number, status: LoopRun["status"], message?: string): LoopRun {
    const file = readJsonFile<RunsFile>(getRunsFile(this.projectRoot), {
      runs: [],
      nextId: 1,
    });
    const run = file.runs.find((r) => r.id === runId);
    if (!run) throw new Error(`找不到 Run: ${runId}`);
    run.status = status;
    run.message = message ?? null;
    run.endedAt = new Date().toISOString();
    writeJsonFile(getRunsFile(this.projectRoot), file);
    return run;
  }

  getRuns(_projectName: string, limit = 20): LoopRun[] {
    const file = readJsonFile<RunsFile>(getRunsFile(this.projectRoot), {
      runs: [],
      nextId: 1,
    });
    return [...file.runs].reverse().slice(0, limit);
  }

  getActiveRun(projectName: string): LoopRun | null {
    return this.getActiveRuns(projectName)[0] ?? null;
  }

  getActiveRuns(projectName: string): LoopRun[] {
    return this.getRuns(projectName, 50).filter((r) => r.status === "running");
  }

  getProjectMeta(projectName: string): {
    name: string;
    branchName: string;
    description: string;
  } {
    const row = this.assertProject(projectName);
    return {
      name: row.name,
      branchName: row.branchName,
      description: row.description,
    };
  }

  getStatus(projectName: string): ProjectStatus {
    const meta = this.getProjectMeta(projectName);
    const stories = this.getStories(projectName);
    const features = this.getFeatures(projectName);
    const milestones = this.getMilestones(projectName);
    const counts = countStories(stories);
    const progress = this.getProgress(projectName, 1);
    const activeRuns = this.getActiveRuns(projectName);
    const activeRun = activeRuns[0] ?? null;
    const currentStory =
      activeRun?.storyId != null
        ? (stories.find((s) => s.id === activeRun.storyId) ?? null)
        : null;
    return {
      project: meta.name,
      branchName: meta.branchName,
      description: meta.description,
      totalStories: counts.total,
      completedStories: counts.completed,
      pendingStories: counts.pending,
      readyStories: counts.ready,
      draftStories: counts.draft,
      blockedStories: counts.blocked,
      totalFeatures: features.length,
      totalMilestones: milestones.length,
      isComplete: counts.total > 0 && counts.pending === 0,
      nextStory: this.getNextStory(projectName),
      currentStory,
      patterns: this.getPatterns(projectName),
      activeRun,
      activeRuns,
      lastProgress: progress[0] ?? null,
    };
  }

  listProjects(): string[] {
    const path = getProjectFile(this.projectRoot);
    if (!existsSync(path)) return [];
    const meta = readJsonFile<ProjectFile | null>(path, null);
    return meta ? [meta.name] : [];
  }
}

/** 状态存储根目录（供 MCP / 日志引用） */
export function getStorePath(projectRoot: string): string {
  return getStateDir(projectRoot);
}

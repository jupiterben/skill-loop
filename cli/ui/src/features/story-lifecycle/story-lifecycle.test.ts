import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import {
  buildTree,
  getActiveStories,
  isPendingRemoval,
} from "../../../../src/tree.js";
import {
  canArchiveStory,
  canCancelRemoval,
  canPurgeStory,
  canRequestRemoval,
  canRestoreStory,
} from "../../lib/deletable";
import { buildProjectMindMap } from "../../lib/mindmapLayout";

const here = dirname(fileURLToPath(import.meta.url));

describe("Story 生命周期（移除、归档、恢复）", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createDb() {
    const root = mkdtempSync(join(tmpdir(), "loop-story-lifecycle-"));
    roots.push(root);
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    db.addFeature("demo", { title: "F1", description: "" });
    const feature = db.getFeatures("demo")[0]!;
    const story = db.addStory("demo", {
      parentId: feature.id,
      title: "待归档 Story",
      description: "描述保留",
      acceptanceCriteria: ["AC"],
      status: "ready",
      workType: "implementation",
    });
    return { db, feature, story };
  }

  function findStoryNode(tree: ReturnType<typeof buildTree>, id: string) {
    for (const ft of tree) {
      const hit = ft.children.find((c) => c.kind === "story" && c.id === id);
      if (hit) return hit;
    }
    return undefined;
  }

  it("request-removal 为曾完成的 Story 设置 removalRequestedAt 并写入进度", () => {
    const { db, story } = createDb();
    db.completeStoryWithProgress("demo", story.id, { summary: "首轮完成" });

    const { story: updated, progressEntry } = db.requestStoryRemoval(
      "demo",
      story.id,
      "不再需要"
    );

    expect(updated.removalRequestedAt).toBeTruthy();
    expect(isPendingRemoval(updated)).toBe(true);
    expect(progressEntry.summary).toContain("用户请求删除");
    expect(progressEntry.summary).toContain("不再需要");
  });

  it("等待删除的 Story 在 tree 中标记 removalRequested", () => {
    const { db, feature, story } = createDb();
    db.completeStoryWithProgress("demo", story.id, { summary: "完成" });
    db.requestStoryRemoval("demo", story.id);

    const tree = buildTree([feature], db.getStories("demo"));
    const node = findStoryNode(tree, story.id);
    expect(node).toMatchObject({
      kind: "story",
      id: story.id,
      removalRequested: true,
    });
  });

  it("archive 后 Story 从活动树隐藏但进度历史保留", () => {
    const { db, feature, story } = createDb();
    db.completeStoryWithProgress("demo", story.id, { summary: "实现完成" });
    db.requestStoryRemoval("demo", story.id);

    const beforeProgress = db.getProgress("demo", 20);
    const { story: archived } = db.archiveStory("demo", story.id, "清理 PRD");

    expect(archived.archivedAt).toBeTruthy();
    expect(archived.removalRequestedAt).toBeNull();

    const active = getActiveStories(db.getStories("demo"));
    expect(active.some((s) => s.id === story.id)).toBe(false);
    expect(findStoryNode(buildTree([feature], db.getStories("demo")), story.id)).toBeUndefined();

    const afterProgress = db.getProgress("demo", 20);
    expect(afterProgress.length).toBeGreaterThanOrEqual(beforeProgress.length);
    expect(afterProgress.some((e) => e.summary === "实现完成")).toBe(true);
    expect(afterProgress.some((e) => e.summary === "清理 PRD")).toBe(true);
  });

  it("restore 后 Story 返回活动树并保持关键字段", () => {
    const { db, feature, story } = createDb();
    db.completeStoryWithProgress("demo", story.id, { summary: "完成" });
    db.requestStoryRemoval("demo", story.id);
    db.archiveStory("demo", story.id);

    const { story: restored } = db.restoreStory("demo", story.id);

    expect(restored.archivedAt).toBeNull();
    expect(restored.title).toBe("待归档 Story");
    expect(restored.description).toBe("描述保留");
    expect(restored.workType).toBe("implementation");
    expect(restored.passes).toBe(true);

    const active = db.getActiveStories("demo");
    expect(active.some((s) => s.id === story.id)).toBe(true);

    const node = findStoryNode(buildTree([feature], db.getStories("demo")), story.id);
    expect(node).toMatchObject({ id: story.id, title: "待归档 Story" });
  });

  it("getStatus 统计不包含已归档 Story", () => {
    const { db, story } = createDb();
    db.completeStoryWithProgress("demo", story.id, { summary: "完成" });
    db.requestStoryRemoval("demo", story.id);
    db.archiveStory("demo", story.id);

    const status = db.getStatus("demo");
    expect(status.totalStories).toBe(0);
    expect(status.completedStories).toBe(0);
    expect(db.getStories("demo").some((s) => s.id === story.id)).toBe(true);
  });

  it("deletable 权限与生命周期状态一致", () => {
    const { db, story } = createDb();
    const stories = () => db.getActiveStories("demo");
    const progress = () => db.getProgress("demo", 50);

    db.completeStoryWithProgress("demo", story.id, { summary: "完成" });
    const completed = db.getStories("demo").find((s) => s.id === story.id)!;
    expect(canRequestRemoval(completed, progress())).toBe(true);
    expect(canArchiveStory(completed, progress())).toBe(false);

    db.requestStoryRemoval("demo", story.id);
    const pending = db.getStories("demo").find((s) => s.id === story.id)!;
    expect(canCancelRemoval(pending)).toBe(true);
    expect(canArchiveStory(pending, progress())).toBe(true);
    expect(canRequestRemoval(pending, progress())).toBe(false);

    db.archiveStory("demo", story.id);
    const archived = db.getStories("demo").find((s) => s.id === story.id)!;
    expect(canRestoreStory(archived)).toBe(true);
    expect(canPurgeStory(archived)).toBe(true);
    expect(stories().some((s) => s.id === story.id)).toBe(false);
  });

  it("脑图将 removalRequested 映射为 pending_removal 节点", () => {
    const { db, feature, story } = createDb();
    db.completeStoryWithProgress("demo", story.id, { summary: "完成" });
    db.requestStoryRemoval("demo", story.id);

    const tree = buildTree([feature], db.getStories("demo"));
    const { nodes } = buildProjectMindMap("demo", 100, tree);
    const storyNode = nodes.find((n) => n.id === story.id);
    expect(storyNode?.data.kind).toBe("pending_removal");
  });

  it("属性面板 StoryStatusTag 对等待删除 Story 显示等待删除标签", () => {
    const propsSrc = readFileSync(
      join(here, "../../components/NodePropsPanel.tsx"),
      "utf8"
    );
    expect(propsSrc).toContain('if (story.removalRequestedAt)');
    expect(propsSrc).toContain('<Tag color="error">等待删除</Tag>');
  });

  it("api.ts 暴露生命周期 HTTP 端点", () => {
    const apiSrc = readFileSync(join(here, "../../lib/api.ts"), "utf8");
    expect(apiSrc).toContain('post("/api/stories/request-removal"');
    expect(apiSrc).toContain('post("/api/stories/cancel-removal"');
    expect(apiSrc).toContain('post("/api/stories/archive"');
    expect(apiSrc).toContain('post("/api/stories/restore"');
    expect(apiSrc).toContain('post("/api/stories/purge"');
  });

  it("MindMapPanel 将生命周期操作接到 api", () => {
    const panelSrc = readFileSync(
      join(here, "../../components/MindMapPanel.tsx"),
      "utf8"
    );
    expect(panelSrc).toContain("api.requestStoryRemoval");
    expect(panelSrc).toContain("api.cancelStoryRemoval");
    expect(panelSrc).toContain("api.archiveStory");
    expect(panelSrc).toContain("api.restoreStory");
    expect(panelSrc).toContain("api.purgeStory");
    expect(panelSrc).toContain('kind: "archived"');
  });

  it("NodePropsPanel 提供生命周期操作入口与归档面板", () => {
    const propsSrc = readFileSync(
      join(here, "../../components/NodePropsPanel.tsx"),
      "utf8"
    );
    expect(propsSrc).toContain("StoryLifecycleActions");
    expect(propsSrc).toContain("删除Story");
    expect(propsSrc).toContain("取消删除");
    expect(propsSrc).toContain("确认归档");
    expect(propsSrc).toContain("永久删除");
    expect(propsSrc).toContain("TrashList");
    expect(propsSrc).toContain("props-panel__kind--pending-removal");
    expect(propsSrc).toContain("props-panel__kind--archived");
    expect(propsSrc).toContain("等待删除");
  });

  it("脑图与样式区分等待删除状态", () => {
    const layoutSrc = readFileSync(
      join(here, "../../lib/mindmapLayout.ts"),
      "utf8"
    );
    expect(layoutSrc).toContain('return "pending_removal"');

    const nodeSrc = readFileSync(
      join(here, "../../components/MindMapNode.tsx"),
      "utf8"
    );
    expect(nodeSrc).toContain("pending_removal");

    const cssSrc = readFileSync(join(here, "../../index.css"), "utf8");
    expect(cssSrc).toContain(".mm-node--pending_removal");
    expect(cssSrc).toContain(".props-lifecycle");
    expect(cssSrc).toContain(".props-trash");
  });
});

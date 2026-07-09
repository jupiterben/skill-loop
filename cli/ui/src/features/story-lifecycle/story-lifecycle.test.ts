import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import {
  buildTree,
  getActiveStories,
  isPendingRemoval,
} from "../../../../src/tree.js";

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
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";

describe("Story 执行命令", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createDb() {
    const root = mkdtempSync(join(tmpdir(), "loop-story-exec-"));
    roots.push(root);
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    db.addFeature("demo", { title: "F1", description: "" });
    const feature = db.getFeatures("demo")[0]!;
    const story = db.addStory("demo", {
      parentId: feature.id,
      title: "测试 Story",
      description: "",
      acceptanceCriteria: ["AC"],
      status: "draft",
    });
    return { db, story };
  }

  it("confirm-story 将草稿 Story 设为 ready", () => {
    const { db, story } = createDb();
    expect(story.status).toBe("draft");

    const confirmed = db.confirmStory("demo", story.id);
    expect(confirmed.status).toBe("ready");
    expect(db.getStories("demo").find((s) => s.id === story.id)?.status).toBe(
      "ready"
    );
  });

  it("unconfirm-story 将未完成的 ready Story 退回 draft", () => {
    const { db, story } = createDb();
    db.confirmStory("demo", story.id);

    const unconfirmed = db.unconfirmStory("demo", story.id);
    expect(unconfirmed.status).toBe("draft");
  });

  it("complete 标记 passes=true 并生成完成进度记录", () => {
    const { db, story } = createDb();
    db.confirmStory("demo", story.id);

    const { story: completed, progressEntry } = db.completeStoryWithProgress(
      "demo",
      story.id,
      { summary: "实现完成" }
    );

    expect(completed.passes).toBe(true);
    expect(completed.everCompleted).toBe(true);
    expect(progressEntry.storyId).toBe(story.id);
    expect(progressEntry.summary).toBe("实现完成");
    expect(progressEntry.entryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const progress = db.getProgress("demo", 10);
    expect(progress.some((e) => e.id === progressEntry.id)).toBe(true);
  });

  it("草稿 Story 不能直接 complete", () => {
    const { db, story } = createDb();
    expect(() =>
      db.completeStoryWithProgress("demo", story.id, { summary: "x" })
    ).toThrow(/confirm-story/);
  });

  it("progress 支持 summary、storyId、learning、entryDate", () => {
    const { db, story } = createDb();

    const entry = db.appendProgress("demo", {
      storyId: story.id,
      entryDate: "2026-07-09",
      summary: "本轮实现登录页",
      learnings: ["复用 auth hook"],
    });

    expect(entry.storyId).toBe(story.id);
    expect(entry.entryDate).toBe("2026-07-09");
    expect(entry.summary).toBe("本轮实现登录页");
    expect(entry.learnings).toEqual(["复用 auth hook"]);
    expect(entry.id).toBeDefined();
  });
});

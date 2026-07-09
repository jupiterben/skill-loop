import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import { getNextStories } from "../../../../src/tree.js";

describe("并行 Worker 执行与认领", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createProjectRoot() {
    const root = mkdtempSync(join(tmpdir(), "loop-parallel-"));
    roots.push(root);
    mkdirSync(join(root, "loop-data"), { recursive: true });
    return root;
  }

  function createDbWithStories(count: number) {
    const root = createProjectRoot();
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    db.addFeature("demo", { title: "F1", description: "" });
    const feature = db.getFeatures("demo")[0]!;
    const stories = Array.from({ length: count }, (_, i) =>
      db.addStory("demo", {
        parentId: feature.id,
        title: `Story ${i + 1}`,
        description: "",
        acceptanceCriteria: ["AC"],
        status: "ready",
      })
    );
    return { db, root, stories };
  }

  it("getNextStories 返回最多 limit 个未认领的 ready Story", () => {
    const { db } = createDbWithStories(3);
    const next = db.getNextStories("demo", 2);
    expect(next).toHaveLength(2);
    expect(next.every((s) => s.status === "ready" && !s.claimedBy)).toBe(true);
  });

  it("getNextStories 跳过已被认领的 Story", () => {
    const { db, stories } = createDbWithStories(3);
    db.claimStory("demo", stories[0]!.id, "w0");

    const next = getNextStories(db.getStories("demo"), 3);
    expect(next).toHaveLength(2);
    expect(next.map((s) => s.id)).not.toContain(stories[0]!.id);
  });

  it("claimStory 设置 claimedBy 与 claimedAt", () => {
    const { db, stories } = createDbWithStories(1);
    const storyId = stories[0]!.id;
    const claimed = db.claimStory("demo", storyId, "w0");

    expect(claimed.claimedBy).toBe("w0");
    expect(claimed.claimedAt).toBeTruthy();
    expect(db.getClaimedStory("demo", "w0")?.id).toBe(storyId);
  });

  it("已认领 Story 不会出现在 getNextStories 中（其他 worker 无法领取）", () => {
    const { db, stories } = createDbWithStories(2);
    const storyId = stories[0]!.id;
    db.claimStory("demo", storyId, "w0");

    const next = db.getNextStories("demo", 3);
    expect(next.map((s) => s.id)).not.toContain(storyId);
    expect(next).toHaveLength(1);
  });

  it("claimStory 对已认领 Story 再次调用会报不可执行", () => {
    const { db, stories } = createDbWithStories(1);
    const storyId = stories[0]!.id;
    db.claimStory("demo", storyId, "w0");

    expect(() => db.claimStory("demo", storyId, "w0")).toThrow(
      /当前不可执行/
    );
    expect(() => db.claimStory("demo", storyId, "w1")).toThrow(
      /当前不可执行/
    );
  });

  it("releaseClaim 清除认领状态", () => {
    const { db, stories } = createDbWithStories(1);
    const storyId = stories[0]!.id;
    db.claimStory("demo", storyId, "w0");

    const released = db.releaseClaim("demo", storyId, "w0");
    expect(released.claimedBy).toBeNull();
    expect(released.claimedAt).toBeNull();
    expect(db.getClaimedStory("demo", "w0")).toBeNull();
    expect(db.getNextStories("demo", 1)[0]?.id).toBe(storyId);
  });

  it("releaseClaim 拒绝非认领 worker 释放", () => {
    const { db, stories } = createDbWithStories(1);
    const storyId = stories[0]!.id;
    db.claimStory("demo", storyId, "w0");

    expect(() => db.releaseClaim("demo", storyId, "w1")).toThrow(
      /w0 认领/
    );
  });

  it("completeStory 完成后清除认领", () => {
    const { db, stories } = createDbWithStories(1);
    const storyId = stories[0]!.id;
    db.claimStory("demo", storyId, "w0");

    const done = db.completeStory("demo", storyId, "w0");
    expect(done.passes).toBe(true);
    expect(done.claimedBy).toBeNull();
    expect(done.claimedAt).toBeNull();
  });

  it("completeStory 拒绝非认领 worker 完成", () => {
    const { db, stories } = createDbWithStories(1);
    const storyId = stories[0]!.id;
    db.claimStory("demo", storyId, "w0");

    expect(() => db.completeStory("demo", storyId, "w1")).toThrow(
      /w0 认领/
    );
  });
});

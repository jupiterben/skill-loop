import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import {
  isEmptyLeafFeature,
  featureHasChildFeatures,
  featureHasDirectStories,
} from "./emptyLeafFeature";

describe("emptyLeafFeature", () => {
  it("识别空叶子 Feature", () => {
    const features = [
      { id: "FT-1", parentId: null, title: "父", description: "", sortOrder: 0 },
      { id: "FT-2", parentId: "FT-1", title: "空叶", description: "", sortOrder: 0 },
    ];
    const stories = [
      {
        id: "US-1",
        parentId: "FT-1",
        title: "Story",
        description: "",
        acceptanceCriteria: [],
        priority: 0,
        passes: false,
        everCompleted: false,
        status: "ready" as const,
        notes: "",
        sortOrder: 0,
        milestoneId: null,
        dependsOn: [],
        removalRequestedAt: null,
        archivedAt: null,
        claimedBy: null,
        claimedAt: null,
      },
    ];
    expect(featureHasChildFeatures("FT-1", features)).toBe(true);
    expect(featureHasDirectStories("FT-1", stories)).toBe(true);
    expect(isEmptyLeafFeature("FT-1", features, stories)).toBe(false);
    expect(isEmptyLeafFeature("FT-2", features, stories)).toBe(true);
  });
});

describe("deleteFeature empty leaf", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createDb() {
    const root = mkdtempSync(join(tmpdir(), "loop-delete-feature-"));
    roots.push(root);
    const db = new LoopStateDb(root);
    db.upsertProject({
      name: "demo",
      branchName: "main",
      description: "测试",
    });
    return { db };
  }

  it("可删除空叶子 Feature", () => {
    const { db } = createDb();
    const empty = db.addFeature("demo", { title: "空 FT", description: "" });
    const deleted = db.deleteFeature("demo", empty.id);
    expect(deleted).toEqual([empty.id]);
    expect(db.getFeatures("demo").some((f) => f.id === empty.id)).toBe(false);
    expect(db.getTree("demo").some((n) => n.id === empty.id)).toBe(false);
  });

  it("存在子 Feature 时拒绝删除", () => {
    const { db } = createDb();
    const parent = db.addFeature("demo", { title: "父", description: "" });
    const child = db.addFeature("demo", {
      title: "子",
      description: "",
      parentId: parent.id,
    });
    expect(() => db.deleteFeature("demo", parent.id)).toThrow(/子 Feature/);
    expect(db.getFeatures("demo").map((f) => f.id).sort()).toEqual(
      [child.id, parent.id].sort()
    );
  });

  it("存在子 Story 时拒绝删除", () => {
    const { db } = createDb();
    const ft = db.addFeature("demo", { title: "有 Story", description: "" });
    db.addStory("demo", {
      title: "US",
      description: "",
      parentId: ft.id,
      acceptanceCriteria: ["AC"],
    });
    expect(() => db.deleteFeature("demo", ft.id)).toThrow(/子 Story/);
    expect(db.getStatus("demo").totalFeatures).toBe(1);
    expect(db.getStatus("demo").totalStories).toBe(1);
  });

  it("删除后 tree 与 status 保持一致", () => {
    const { db } = createDb();
    const keep = db.addFeature("demo", { title: "保留", description: "" });
    const drop = db.addFeature("demo", { title: "删除", description: "" });
    db.deleteFeature("demo", drop.id);
    const status = db.getStatus("demo");
    expect(status.totalFeatures).toBe(1);
    expect(status.pendingStories).toBe(0);
    expect(db.getTree("demo").map((n) => n.id)).toEqual([keep.id]);
  });
});

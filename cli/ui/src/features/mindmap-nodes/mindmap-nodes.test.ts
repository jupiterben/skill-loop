import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import { getFeaturesDir, getStoriesDir } from "../../../../src/paths.js";
import {
  canDeleteFeature,
  canHardDeleteStory,
} from "../../lib/deletable";

describe("脑图节点增删（loop-data 持久化）", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createDb() {
    const root = mkdtempSync(join(tmpdir(), "loop-mindmap-nodes-"));
    roots.push(root);
    const db = new LoopStateDb(root);
    db.upsertProject({
      name: "demo",
      branchName: "main",
      description: "测试",
    });
    return { db, root };
  }

  it("addFeature 写入 loop-data/features 并保持 parentId", () => {
    const { db, root } = createDb();
    const parent = db.addFeature("demo", { title: "父 FT", description: "" });
    const child = db.addFeature("demo", {
      title: "子 FT",
      description: "desc",
      parentId: parent.id,
    });

    const filePath = join(getFeaturesDir(root), `${child.id}.json`);
    expect(existsSync(filePath)).toBe(true);
    const saved = JSON.parse(readFileSync(filePath, "utf8")) as {
      id: string;
      parentId: string;
      title: string;
    };
    expect(saved).toMatchObject({
      id: child.id,
      parentId: parent.id,
      title: "子 FT",
    });
    expect(db.getFeatures("demo").find((f) => f.id === child.id)?.parentId).toBe(
      parent.id
    );
  });

  it("addStory 写入 loop-data/stories 并挂在父 Feature 下", () => {
    const { db, root } = createDb();
    const ft = db.addFeature("demo", { title: "FT", description: "" });
    const story = db.addStory("demo", {
      title: "新 Story",
      description: "说明",
      parentId: ft.id,
      acceptanceCriteria: ["AC1"],
      priority: 1,
      everCompleted: false,
      notes: "",
      dependsOn: [],
      milestoneId: null,
    });

    const filePath = join(getStoriesDir(root), `${story.id}.json`);
    expect(existsSync(filePath)).toBe(true);
    const saved = JSON.parse(readFileSync(filePath, "utf8")) as {
      parentId: string;
      title: string;
      status: string;
    };
    expect(saved.parentId).toBe(ft.id);
    expect(saved.title).toBe("新 Story");
    expect(saved.status).toBe("draft");

    const tree = db.getTree("demo");
    const ftNode = tree.find((n) => n.id === ft.id);
    expect(ftNode?.children?.some((c) => c.id === story.id)).toBe(true);
  });

  it("空项目新增后 getTree 与 status 同步更新", () => {
    const { db } = createDb();
    expect(db.getStatus("demo").totalFeatures).toBe(0);
    expect(db.getTree("demo")).toEqual([]);

    const ft = db.addFeature("demo", { title: "首个 FT", description: "" });
    const status = db.getStatus("demo");
    expect(status.totalFeatures).toBe(1);
    expect(status.totalStories).toBe(0);
    expect(db.getTree("demo").map((n) => n.id)).toEqual([ft.id]);
  });

  it("deleteFeature 移除文件且节点从 tree 消失", () => {
    const { db, root } = createDb();
    const keep = db.addFeature("demo", { title: "保留", description: "" });
    const drop = db.addFeature("demo", { title: "删除", description: "" });
    expect(existsSync(join(getFeaturesDir(root), `${drop.id}.json`))).toBe(
      true
    );

    db.deleteFeature("demo", drop.id);

    expect(existsSync(join(getFeaturesDir(root), `${drop.id}.json`))).toBe(
      false
    );
    expect(db.getTree("demo").map((n) => n.id)).toEqual([keep.id]);
    expect(db.getStatus("demo").totalFeatures).toBe(1);
  });

  it("deleteStory 移除文件且节点从 tree 消失", () => {
    const { db, root } = createDb();
    const ft = db.addFeature("demo", { title: "FT", description: "" });
    const keep = db.addStory("demo", {
      title: "保留",
      description: "",
      parentId: ft.id,
      acceptanceCriteria: [],
      priority: 1,
      everCompleted: false,
      notes: "",
      dependsOn: [],
      milestoneId: null,
    });
    const drop = db.addStory("demo", {
      title: "删除",
      description: "",
      parentId: ft.id,
      acceptanceCriteria: [],
      priority: 2,
      everCompleted: false,
      notes: "",
      dependsOn: [],
      milestoneId: null,
    });

    db.deleteStory("demo", drop.id);

    expect(existsSync(join(getStoriesDir(root), `${drop.id}.json`))).toBe(
      false
    );
    const ftNode = db.getTree("demo").find((n) => n.id === ft.id);
    expect(ftNode?.children?.map((c) => c.id)).toEqual([keep.id]);
    expect(db.getStatus("demo").totalStories).toBe(1);
  });
});

describe("脑图节点删除资格（MindMapPanel onNodesDelete）", () => {
  const features = [
    { id: "FT-1", parentId: null, title: "父", description: "", sortOrder: 0 },
    { id: "FT-2", parentId: "FT-1", title: "空叶", description: "", sortOrder: 0 },
  ];
  const stories = [
    {
      id: "US-1",
      parentId: "FT-1",
      title: "草稿",
      description: "",
      acceptanceCriteria: [],
      priority: 0,
      passes: false,
      everCompleted: false,
      status: "draft" as const,
      notes: "",
      sortOrder: 0,
      milestoneId: null,
      dependsOn: [],
      removalRequestedAt: null,
      archivedAt: null,
      claimedBy: null,
      claimedAt: null,
    },
    {
      id: "US-2",
      parentId: "FT-1",
      title: "已完成",
      description: "",
      acceptanceCriteria: [],
      priority: 1,
      passes: true,
      everCompleted: true,
      status: "ready" as const,
      notes: "",
      sortOrder: 1,
      milestoneId: null,
      dependsOn: [],
      removalRequestedAt: null,
      archivedAt: null,
      claimedBy: null,
      claimedAt: null,
    },
  ];
  const progress: { storyId: string; summary: string }[] = [];

  it("仅空叶子 Feature 可删", () => {
    expect(canDeleteFeature("FT-2", features, stories)).toBe(true);
    expect(canDeleteFeature("FT-1", features, stories)).toBe(false);
  });

  it("仅无进度、未完成的 Story 可硬删", () => {
    expect(canHardDeleteStory("US-1", stories, progress)).toBe(true);
    expect(canHardDeleteStory("US-2", stories, progress)).toBe(false);
  });
});

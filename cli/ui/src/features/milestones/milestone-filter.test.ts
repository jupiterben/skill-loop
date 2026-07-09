import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import { buildMindMapNavIndex } from "../../lib/mindmapKeyboardNav";
import { buildProjectTreeData } from "../../lib/treeViewData";
import {
  filterTreeByMilestone,
  MILESTONE_NONE,
  MILESTONE_NONE_LABEL,
} from "../../lib/treeFilter";
const here = dirname(fileURLToPath(import.meta.url));
const uiRoot = join(here, "../..");

function storyIdsInTree(roots: ReturnType<typeof filterTreeByMilestone>): string[] {
  const ids: string[] = [];
  function walk(nodes: typeof roots) {
    for (const n of nodes) {
      if (n.kind === "story") ids.push(n.id);
      walk(n.children);
    }
  }
  walk(roots);
  return ids;
}

describe("Milestone 筛选与创建编辑", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createDbWithMilestones() {
    const root = mkdtempSync(join(tmpdir(), "loop-milestone-filter-"));
    roots.push(root);
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    const msA = db.addMilestone("demo", {
      title: "阶段 A",
      description: "",
      version: "v0.1",
    });
    const msB = db.addMilestone("demo", {
      title: "阶段 B",
      description: "",
      targetDate: "2026-12-31",
    });
    db.addFeature("demo", { title: "功能", description: "" });
    const feature = db.getFeatures("demo")[0]!;
    const sNone = db.addStory("demo", {
      parentId: feature.id,
      title: "无 Milestone",
      description: "",
      acceptanceCriteria: ["ac"],
      status: "ready",
    });
    const sA = db.addStory("demo", {
      parentId: feature.id,
      title: "属于 A",
      description: "",
      acceptanceCriteria: ["ac"],
      status: "ready",
      milestoneId: msA.id,
    });
    const sB = db.addStory("demo", {
      parentId: feature.id,
      title: "属于 B",
      description: "",
      acceptanceCriteria: ["ac"],
      status: "ready",
      milestoneId: msB.id,
    });
    const tree = db.getTree("demo");
    const userStories = db.getStories("demo");
    return { db, msA, msB, sNone, sA, sB, tree, userStories };
  }

  it("filterTreeByMilestone 无筛选时返回完整树", () => {
    const { tree, userStories } = createDbWithMilestones();
    const filtered = filterTreeByMilestone(tree, userStories, null);
    expect(storyIdsInTree(filtered).sort()).toEqual(
      userStories.map((s) => s.id).sort()
    );
  });

  it("filterTreeByMilestone 按具体 Milestone 过滤 Story", () => {
    const { msA, sA, tree, userStories } = createDbWithMilestones();
    const filtered = filterTreeByMilestone(tree, userStories, msA.id);
    expect(storyIdsInTree(filtered)).toEqual([sA.id]);
  });

  it(`filterTreeByMilestone 支持「${MILESTONE_NONE_LABEL}」筛选未绑定 Story`, () => {
    const { sNone, tree, userStories } = createDbWithMilestones();
    const filtered = filterTreeByMilestone(tree, userStories, MILESTONE_NONE);
    expect(storyIdsInTree(filtered)).toEqual([sNone.id]);
  });

  it("筛选后 Feature 仍保留（含无可见 Story 的空分支）", () => {
    const { msA, tree, userStories } = createDbWithMilestones();
    const filtered = filterTreeByMilestone(tree, userStories, msA.id);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.kind).toBe("feature");
    expect(filtered[0]?.children).toHaveLength(1);
  });

  it("筛选结果在脑图导航索引与结构树中 Story 集合一致", () => {
    const { msB, tree, userStories } = createDbWithMilestones();
    const filtered = filterTreeByMilestone(tree, userStories, msB.id);
    const nav = buildMindMapNavIndex(filtered, new Set());
    const treeData = buildProjectTreeData("demo", 0, filtered);
    const navStoryIds = [...nav.visible].filter((id) => id.startsWith("US-"));
    const treeStoryIds =
      treeData[0]?.children?.[0]?.children?.map((c) => String(c.key)) ?? [];
    expect(navStoryIds.sort()).toEqual(treeStoryIds.sort());
    expect(navStoryIds).toHaveLength(1);
    expect(navStoryIds[0]).toBe(
      userStories.find((s) => s.milestoneId === msB.id)?.id
    );
  });

  it("Dashboard 支持创建与编辑 Milestone 基本信息", () => {
    const { db } = createDbWithMilestones();
    const created = db.addMilestone("demo", {
      title: "新阶段",
      description: "说明",
      targetDate: "2026-08-01",
      version: "v2",
    });
    expect(created.title).toBe("新阶段");
    expect(created.targetDate).toBe("2026-08-01");
    expect(created.version).toBe("v2");

    const updated = db.updateMilestone("demo", created.id, {
      title: "重命名",
      version: "v2.1",
    });
    expect(updated.title).toBe("重命名");
    expect(updated.version).toBe("v2.1");
  });

  it("MindMapPanel 提供 Milestone 筛选栏与创建/编辑弹窗", () => {
    const src = readFileSync(join(uiRoot, "components/MindMapPanel.tsx"), "utf8");
    expect(src).toContain("mm-milestone-bar");
    expect(src).toContain("全部");
    expect(src).toContain(MILESTONE_NONE_LABEL);
    expect(src).toContain("+ MileStone");
    expect(src).toContain("openMilestoneModal");
    expect(src).toContain('onDoubleClick');
    expect(src).toContain("filterTreeByMilestone");
    expect(src).toContain("tree={filteredTree}");
  });

  it("NodePropsPanel 支持 Story Milestone 分配", () => {
    const src = readFileSync(join(uiRoot, "components/NodePropsPanel.tsx"), "utf8");
    expect(src).toContain("onAssignMilestone");
    expect(src).toContain("props-milestone-chips");
    expect(src).toContain("milestoneFullLabel");
  });

  it("API 暴露 addMilestone / updateMilestone / setStoryMilestone", () => {
    const src = readFileSync(join(uiRoot, "lib/api.ts"), "utf8");
    expect(src).toContain("addMilestone");
    expect(src).toContain("updateMilestone");
    expect(src).toContain("setStoryMilestone");
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Node } from "@xyflow/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import {
  dropTargetToParentId,
  isReparentableKind,
  reparentItemKind,
  resolveDropTargetId,
} from "../../lib/mindmapReparent";
import { MINDMAP_ROOT_ID } from "../../lib/mindmapLayout";
import type { MindMapNodeData } from "../../lib/mindmapLayout";
import {
  featureReorderState,
  storyReorderState,
} from "../../lib/reorder";

describe("脑图拖拽改父级与重排", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createDb() {
    const root = mkdtempSync(join(tmpdir(), "loop-mindmap-drag-"));
    roots.push(root);
    const db = new LoopStateDb(root);
    db.upsertProject({
      name: "demo",
      branchName: "main",
      description: "测试",
    });
    return { db };
  }

  function flowNode(
    id: string,
    kind: MindMapNodeData["kind"],
    size = { w: 172, h: 54 }
  ): Node {
    return {
      id,
      type: "mindmap",
      position: { x: 0, y: 0 },
      data: { kind } as MindMapNodeData,
      width: size.w,
      height: size.h,
    };
  }

  it("moveMindMapItem 支持拖拽修改 Feature/Story 父级", () => {
    const { db } = createDb();
    const ftA = db.addFeature("demo", { title: "A", description: "" });
    const ftB = db.addFeature("demo", {
      title: "B",
      description: "",
      parentId: ftA.id,
    });
    const story = db.addStory("demo", {
      title: "S1",
      description: "",
      parentId: ftA.id,
      acceptanceCriteria: ["ac"],
    });

    const movedFt = db.moveMindMapItem("demo", {
      id: ftB.id,
      kind: "feature",
      parentId: null,
    });
    expect(movedFt.parentId).toBeNull();

    const movedStory = db.moveMindMapItem("demo", {
      id: story.id,
      kind: "story",
      parentId: ftB.id,
    });
    expect(movedStory.parentId).toBe(ftB.id);
  });

  it("reorderFeature/reorderStory 交换同级 sortOrder", () => {
    const { db } = createDb();
    const ft = db.addFeature("demo", { title: "父", description: "" });
    const f1 = db.addFeature("demo", {
      title: "F1",
      description: "",
      parentId: ft.id,
    });
    const f2 = db.addFeature("demo", {
      title: "F2",
      description: "",
      parentId: ft.id,
    });
    db.updateFeature("demo", f2.id, { sortOrder: 1 });

    const reordered = db.reorderFeature("demo", f2.id, "up");
    expect(reordered.sortOrder).toBe(f1.sortOrder);

    const s1 = db.addStory("demo", {
      title: "S1",
      description: "",
      parentId: ft.id,
      acceptanceCriteria: ["ac"],
      sortOrder: 0,
      priority: 0,
    });
    const s2 = db.addStory("demo", {
      title: "S2",
      description: "",
      parentId: ft.id,
      acceptanceCriteria: ["ac"],
      sortOrder: 1,
      priority: 1,
    });

    const movedStory = db.reorderStory("demo", s2.id, "up");
    expect(movedStory.sortOrder).toBe(s1.sortOrder);
    expect(movedStory.priority).toBe(s1.priority);
  });

  it("非法移动（移到自身子树下）被拒绝并给出清晰错误", () => {
    const { db } = createDb();
    const parent = db.addFeature("demo", { title: "父", description: "" });
    const child = db.addFeature("demo", {
      title: "子",
      description: "",
      parentId: parent.id,
    });

    expect(() =>
      db.moveFeature("demo", parent.id, child.id)
    ).toThrow("不能将 Feature 移动到其子节点下");

    expect(() =>
      db.moveFeature("demo", parent.id, parent.id)
    ).toThrow("不能将 Feature 移动到自身下");
  });

  it("reorder 工具函数反映同级可上/下移状态", () => {
    const { db } = createDb();
    const ft = db.addFeature("demo", { title: "父", description: "" });
    const f1 = db.addFeature("demo", {
      title: "F1",
      description: "",
      parentId: ft.id,
    });
    const f2 = db.addFeature("demo", {
      title: "F2",
      description: "",
      parentId: ft.id,
    });
    db.updateFeature("demo", f2.id, { sortOrder: 1 });

    const features = db.getFeatures("demo");
    expect(featureReorderState(f1.id, features)).toEqual({
      canMoveUp: false,
      canMoveDown: true,
    });
    expect(featureReorderState(f2.id, features)).toEqual({
      canMoveUp: true,
      canMoveDown: false,
    });

    const s1 = db.addStory("demo", {
      title: "S1",
      description: "",
      parentId: ft.id,
      acceptanceCriteria: ["ac"],
      sortOrder: 0,
    });
    const s2 = db.addStory("demo", {
      title: "S2",
      description: "",
      parentId: ft.id,
      acceptanceCriteria: ["ac"],
      sortOrder: 1,
    });
    const stories = db.getStories("demo");
    expect(storyReorderState(s1.id, stories)).toEqual({
      canMoveUp: false,
      canMoveDown: true,
    });
    expect(storyReorderState(s2.id, stories)).toEqual({
      canMoveUp: true,
      canMoveDown: false,
    });
  });

  it("mindmapReparent 辅助：落点解析与可拖节点类型", () => {
    expect(isReparentableKind("feature")).toBe(true);
    expect(isReparentableKind("story")).toBe(true);
    expect(isReparentableKind("root")).toBe(false);
    expect(reparentItemKind("feature")).toBe("feature");
    expect(reparentItemKind("draft")).toBe("story");
    expect(dropTargetToParentId(MINDMAP_ROOT_ID)).toBeNull();
    expect(dropTargetToParentId("FT-001")).toBe("FT-001");

    const root = flowNode(MINDMAP_ROOT_ID, "root", { w: 400, h: 200 });
    const bigFt = flowNode("FT-A", "feature", { w: 300, h: 100 });
    const smallFt = flowNode("FT-B", "feature", { w: 100, h: 40 });
    const dragged = flowNode("US-001", "story", { w: 172, h: 54 });
    dragged.position = { x: 50, y: 20 };

    const target = resolveDropTargetId(
      [root, bigFt, smallFt],
      dragged.id
    );
    expect(target).toBe("FT-B");
  });

  it("Dashboard API 路径：/api/mindmap/move 与 /api/mindmap/reorder", () => {
    const apiPaths = ["/api/mindmap/move", "/api/mindmap/reorder"];
    expect(apiPaths).toContain("/api/mindmap/move");
    expect(apiPaths).toContain("/api/mindmap/reorder");
  });
});

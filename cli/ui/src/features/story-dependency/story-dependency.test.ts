import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import {
  buildTree,
  isStoryReady,
  wouldCreateDependencyCycle,
} from "../../../../src/tree.js";
import { buildProjectMindMap, isDependencyEdge } from "../../lib/mindmapLayout";

function isDepHandleConnection(conn: {
  sourceHandle?: string | null;
  targetHandle?: string | null;
}) {
  return conn.sourceHandle === "dep-out" && conn.targetHandle === "dep-in";
}

describe("Story 依赖连线", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createDb() {
    const root = mkdtempSync(join(tmpdir(), "loop-story-dep-"));
    roots.push(root);
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    const ft = db.addFeature("demo", { title: "F1", description: "" });
    const a = db.addStory("demo", {
      parentId: ft.id,
      title: "A",
      description: "",
      acceptanceCriteria: ["ac"],
      status: "ready",
    });
    const b = db.addStory("demo", {
      parentId: ft.id,
      title: "B",
      description: "",
      acceptanceCriteria: ["ac"],
      status: "ready",
    });
    const c = db.addStory("demo", {
      parentId: ft.id,
      title: "C",
      description: "",
      acceptanceCriteria: ["ac"],
      status: "ready",
    });
    return { db, ft, a, b, c };
  }

  it("addStoryDependency 通过连线语义建立 dependsOn（from → to）", () => {
    const { db, a, b } = createDb();
    const updated = db.addStoryDependency("demo", a.id, b.id);
    expect(updated.dependsOn).toEqual([a.id]);

    const stored = db.getStories("demo").find((s) => s.id === b.id);
    expect(stored?.dependsOn).toEqual([a.id]);
  });

  it("removeStoryDependency 删除依赖并同步故事数据", () => {
    const { db, a, b } = createDb();
    db.addStoryDependency("demo", a.id, b.id);
    const updated = db.removeStoryDependency("demo", a.id, b.id);
    expect(updated.dependsOn).toEqual([]);

    const stored = db.getStories("demo").find((s) => s.id === b.id);
    expect(stored?.dependsOn).toEqual([]);
  });

  it("重复添加同一依赖为幂等，不重复写入", () => {
    const { db, a, b } = createDb();
    db.addStoryDependency("demo", a.id, b.id);
    const again = db.addStoryDependency("demo", a.id, b.id);
    expect(again.dependsOn).toEqual([a.id]);
  });

  it("拒绝自依赖、环路与不存在的前置 Story", () => {
    const { db, a, b, c } = createDb();
    expect(() => db.addStoryDependency("demo", a.id, a.id)).toThrow(
      /不能依赖自身/
    );
    expect(() => db.addStoryDependency("demo", "US-missing", b.id)).toThrow(
      /找不到/
    );

    db.addStoryDependency("demo", a.id, b.id);
    db.addStoryDependency("demo", b.id, c.id);
    expect(() => db.addStoryDependency("demo", c.id, a.id)).toThrow(/环/);
  });

  it("wouldCreateDependencyCycle 与 isStoryReady 反映依赖阻塞", () => {
    const { db, a, b } = createDb();
    const stories = db.getStories("demo");
    expect(wouldCreateDependencyCycle(stories, a.id, b.id)).toBe(false);
    expect(wouldCreateDependencyCycle(stories, b.id, a.id)).toBe(false);

    db.addStoryDependency("demo", a.id, b.id);
    const after = db.getStories("demo");
    const storyB = after.find((s) => s.id === b.id)!;
    expect(isStoryReady(storyB, after)).toBe(false);

    db.completeStory("demo", a.id);
    const done = db.getStories("demo");
    const readyB = done.find((s) => s.id === b.id)!;
    expect(isStoryReady(readyB, done)).toBe(true);
  });

  it("buildTree 携带 dependsOn，脑图生成 dep 边且 isDependencyEdge 可识别", () => {
    const { db, a, b, ft } = createDb();
    db.addStoryDependency("demo", a.id, b.id);
    const stories = db.getStories("demo");
    const features = db.getFeatures("demo");
    const tree = buildTree(features, stories);
    const storyB = tree[0]!.children.find((c) => c.id === b.id);
    expect(storyB?.dependsOn).toEqual([a.id]);

    const deps = stories.flatMap((s) =>
      (s.dependsOn ?? []).map((from) => ({ from, to: s.id }))
    );
    const { edges } = buildProjectMindMap("demo", 0, tree, deps);
    const depEdges = edges.filter((e) => isDependencyEdge(e));
    expect(depEdges.map((e) => e.id)).toEqual([`dep:${a.id}->${b.id}`]);
    expect(depEdges[0]?.sourceHandle).toBe("dep-out");
    expect(depEdges[0]?.targetHandle).toBe("dep-in");
    expect(ft.id).toBeTruthy();
  });

  it("仅 dep-out → dep-in 连线才视为依赖连接", () => {
    expect(
      isDepHandleConnection({ sourceHandle: "dep-out", targetHandle: "dep-in" })
    ).toBe(true);
    expect(
      isDepHandleConnection({ sourceHandle: "tree", targetHandle: "dep-in" })
    ).toBe(false);
    expect(
      isDepHandleConnection({ sourceHandle: "dep-out", targetHandle: "tree" })
    ).toBe(false);
  });
});

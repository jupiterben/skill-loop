import { describe, expect, it } from "vitest";
import {
  buildProjectMindMap,
  isDependencyEdge,
  MINDMAP_ROOT_ID,
} from "./mindmapLayout";
import type { StoryDependency, TreeNode } from "../types";

function sampleTree(): TreeNode[] {
  return [
    {
      kind: "feature",
      id: "FT-001",
      title: "Dashboard",
      description: "",
      sortOrder: 0,
      children: [
        {
          kind: "story",
          id: "US-001",
          title: "界面优化",
          description: "",
          sortOrder: 0,
          passes: true,
          status: "ready",
          children: [],
        },
        {
          kind: "story",
          id: "US-002",
          title: "Patterns CRUD",
          description: "",
          sortOrder: 1,
          draft: true,
          status: "draft",
          children: [],
        },
      ],
    },
    {
      kind: "feature",
      id: "FT-003",
      title: "脑图",
      description: "",
      sortOrder: 1,
      children: [
        {
          kind: "story",
          id: "US-003",
          title: "脑图显示",
          description: "",
          sortOrder: 0,
          status: "ready",
          children: [],
        },
      ],
    },
  ];
}

const deps: StoryDependency[] = [{ from: "US-002", to: "US-003" }];

function treeEdgeIds(edges: ReturnType<typeof buildProjectMindMap>["edges"]) {
  return edges.filter((e) => !isDependencyEdge(e)).map((e) => e.id);
}

function depEdgeIds(edges: ReturnType<typeof buildProjectMindMap>["edges"]) {
  return edges.filter((e) => isDependencyEdge(e)).map((e) => e.id);
}

describe("buildProjectMindMap", () => {
  it("creates tree edges with stable tree handle for each parent-child link", () => {
    const { edges } = buildProjectMindMap("skill-loop", 33, sampleTree(), deps);
    const treeEdges = edges.filter((e) => !isDependencyEdge(e));

    expect(treeEdges.map((e) => e.id)).toEqual([
      "tree:project:root->FT-001",
      "tree:FT-001->US-001",
      "tree:FT-001->US-002",
      "tree:project:root->FT-003",
      "tree:FT-003->US-003",
    ]);
    expect(treeEdges.every((e) => e.sourceHandle === "tree")).toBe(true);
  });

  it("creates dependency edges when both stories are visible", () => {
    const { edges } = buildProjectMindMap("skill-loop", 33, sampleTree(), deps);
    expect(depEdgeIds(edges)).toEqual(["dep:US-002->US-003"]);
  });

  it("preserves tree edges after node height relayout", () => {
    const before = buildProjectMindMap("skill-loop", 33, sampleTree(), deps);
    const after = buildProjectMindMap(
      "skill-loop",
      33,
      sampleTree(),
      deps,
      new Set(),
      { "US-001": 120, "US-003": 96 }
    );

    expect(treeEdgeIds(after.edges)).toEqual(treeEdgeIds(before.edges));
    expect(depEdgeIds(after.edges)).toEqual(depEdgeIds(before.edges));
  });

  it("restores tree edges after collapse then expand", () => {
    const expanded = buildProjectMindMap("skill-loop", 33, sampleTree(), deps);
    const collapsed = buildProjectMindMap(
      "skill-loop",
      33,
      sampleTree(),
      deps,
      new Set([MINDMAP_ROOT_ID])
    );
    const reExpanded = buildProjectMindMap("skill-loop", 33, sampleTree(), deps);

    expect(treeEdgeIds(collapsed.edges).length).toBeLessThan(
      treeEdgeIds(expanded.edges).length
    );
    expect(treeEdgeIds(reExpanded.edges)).toEqual(treeEdgeIds(expanded.edges));
  });

  it("drops dependency edges only when an endpoint is not visible", () => {
    const collapsedFeature = buildProjectMindMap(
      "skill-loop",
      33,
      sampleTree(),
      deps,
      new Set(["FT-001"])
    );
    expect(depEdgeIds(collapsedFeature.edges)).toEqual([]);

    const restored = buildProjectMindMap("skill-loop", 33, sampleTree(), deps);
    expect(depEdgeIds(restored.edges)).toEqual(["dep:US-002->US-003"]);
  });
});

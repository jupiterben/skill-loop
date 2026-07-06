import { describe, expect, it } from "vitest";
import {
  buildProjectTreeData,
  findTreeNodeKind,
  treeNodeToSelectedKind,
} from "./treeViewData";
import type { TreeNode } from "../types";
import { MINDMAP_ROOT_ID } from "./mindmapLayout";

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
          title: "草稿 Story",
          description: "",
          sortOrder: 1,
          draft: true,
          status: "draft",
          children: [],
        },
      ],
    },
  ];
}

describe("treeViewData", () => {
  it("maps story states to selected kinds", () => {
    const [feature] = sampleTree();
    const done = feature.children[0]!;
    const draft = feature.children[1]!;
    expect(treeNodeToSelectedKind(done)).toBe("done");
    expect(treeNodeToSelectedKind(draft)).toBe("draft");
    expect(treeNodeToSelectedKind(feature)).toBe("feature");
  });

  it("builds project / feature / story hierarchy", () => {
    const data = buildProjectTreeData("skill-loop", 50, sampleTree());
    expect(data).toHaveLength(1);
    expect(data[0]?.key).toBe(MINDMAP_ROOT_ID);
    expect(data[0]?.meta.label).toBe("skill-loop");
    expect(data[0]?.children?.[0]?.key).toBe("FT-001");
    expect(data[0]?.children?.[0]?.children?.[0]?.key).toBe("US-001");
    expect(data[0]?.children?.[0]?.children?.[1]?.meta.kind).toBe("draft");
  });

  it("finds node kind by id", () => {
    const roots = sampleTree();
    expect(findTreeNodeKind(roots, MINDMAP_ROOT_ID)).toBe("root");
    expect(findTreeNodeKind(roots, "FT-001")).toBe("feature");
    expect(findTreeNodeKind(roots, "US-002")).toBe("draft");
    expect(findTreeNodeKind(roots, "missing")).toBeNull();
  });

  it("marks running stories in tree meta", () => {
    const data = buildProjectTreeData("skill-loop", 50, sampleTree(), new Set(["US-002"]));
    const draft = data[0]?.children?.[0]?.children?.[1];
    expect(draft?.meta.running).toBe(true);
  });
});

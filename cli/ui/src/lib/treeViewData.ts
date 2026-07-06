import type { TreeDataNode } from "antd";
import type { SelectedMindMapNode, TreeNode } from "../types";
import { MINDMAP_ROOT_ID } from "./mindmapLayout";

export type WorkspaceView = "mindmap" | "tree";

const WORKSPACE_VIEW_KEY = "loop-workspace-view";

export function loadWorkspaceView(): WorkspaceView {
  try {
    const stored = localStorage.getItem(WORKSPACE_VIEW_KEY);
    if (stored === "mindmap" || stored === "tree") return stored;
  } catch {
    /* ignore */
  }
  return "mindmap";
}

export function saveWorkspaceView(view: WorkspaceView): void {
  try {
    localStorage.setItem(WORKSPACE_VIEW_KEY, view);
  } catch {
    /* ignore */
  }
}

export function treeNodeToSelectedKind(
  node: TreeNode
): SelectedMindMapNode["kind"] {
  if (node.kind === "feature") return "feature";
  if (node.passes) return "done";
  if (node.removalRequested) return "pending_removal";
  if (node.draft) return "draft";
  if (node.blocked) return "blocked";
  return "story";
}

export interface ProjectTreeNodeMeta {
  kind: SelectedMindMapNode["kind"];
  label: string;
  sublabel?: string;
  running?: boolean;
}

export type ProjectTreeDataNode = TreeDataNode & {
  meta: ProjectTreeNodeMeta;
};

function storyStatusLabel(node: TreeNode): string | undefined {
  if (node.passes) return "已完成";
  if (node.draft) return "草稿";
  if (node.blocked) return "阻塞";
  if (node.removalRequested) return "待移除";
  return undefined;
}

function walkTreeNode(
  node: TreeNode,
  runningIds: ReadonlySet<string>
): ProjectTreeDataNode {
  const kind = treeNodeToSelectedKind(node);
  return {
    key: node.id,
    meta: {
      kind,
      label: node.title,
      sublabel:
        node.kind === "feature"
          ? "Feature"
          : storyStatusLabel(node) ?? node.id,
      running: runningIds.has(node.id),
    },
    children: node.children.map((child) => walkTreeNode(child, runningIds)),
  };
}

export function buildProjectTreeData(
  projectTitle: string,
  progressPct: number,
  roots: TreeNode[],
  runningIds: ReadonlySet<string> = new Set()
): ProjectTreeDataNode[] {
  return [
    {
      key: MINDMAP_ROOT_ID,
      meta: {
        kind: "root",
        label: projectTitle,
        sublabel: `${progressPct}%`,
      },
      children: roots.map((node) => walkTreeNode(node, runningIds)),
    },
  ];
}

export function findTreeNodeKind(
  roots: TreeNode[],
  id: string
): SelectedMindMapNode["kind"] | null {
  if (id === MINDMAP_ROOT_ID) return "root";
  function walk(nodes: TreeNode[]): SelectedMindMapNode["kind"] | null {
    for (const node of nodes) {
      if (node.id === id) return treeNodeToSelectedKind(node);
      const nested = walk(node.children);
      if (nested) return nested;
    }
    return null;
  }
  return walk(roots);
}

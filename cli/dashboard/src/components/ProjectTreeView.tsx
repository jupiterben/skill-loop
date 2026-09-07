import { useMemo } from "react";
import { Tree } from "antd";
import type { SelectedMindMapNode, TreeNode } from "../types";
import {
  buildProjectTreeData,
  type ProjectTreeDataNode,
} from "../lib/treeViewData";

interface Props {
  projectTitle: string;
  progressPct: number;
  tree: TreeNode[];
  selectedId: string | null;
  runningIds: ReadonlySet<string>;
  onSelect: (id: string, kind: SelectedMindMapNode["kind"]) => void;
}

function renderTreeTitle(node: ProjectTreeDataNode) {
  const { label, sublabel, running, kind } = node.meta;
  return (
    <span
      className={`project-tree-view__title project-tree-view__title--${kind}${
        running ? " project-tree-view__title--running" : ""
      }`}
    >
      <span className="project-tree-view__label">{label}</span>
      {sublabel ? (
        <span className="project-tree-view__meta">{sublabel}</span>
      ) : null}
      {running ? (
        <span className="project-tree-view__running">运行中</span>
      ) : null}
    </span>
  );
}

export function ProjectTreeView({
  projectTitle,
  progressPct,
  tree,
  selectedId,
  runningIds,
  onSelect,
}: Props) {
  const treeData = useMemo(
    () => buildProjectTreeData(projectTitle, progressPct, tree, runningIds),
    [projectTitle, progressPct, tree, runningIds]
  );

  return (
    <div className="project-tree-view">
      <Tree
        className="project-tree-view__tree"
        blockNode
        showLine
        defaultExpandAll
        selectedKeys={selectedId ? [selectedId] : []}
        treeData={treeData}
        titleRender={(node) => renderTreeTitle(node as ProjectTreeDataNode)}
        onSelect={(keys) => {
          const id = keys[0];
          if (typeof id !== "string") return;
          const match = findNodeByKey(treeData, id);
          if (!match) return;
          onSelect(id, match.meta.kind);
        }}
      />
    </div>
  );
}

function findNodeByKey(
  nodes: ProjectTreeDataNode[],
  key: string
): ProjectTreeDataNode | null {
  for (const node of nodes) {
    if (node.key === key) return node;
    if (node.children?.length) {
      const nested = findNodeByKey(node.children as ProjectTreeDataNode[], key);
      if (nested) return nested;
    }
  }
  return null;
}

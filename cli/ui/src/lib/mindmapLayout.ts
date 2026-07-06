import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import type { StoryDependency, TreeNode } from "../types";

export type MindMapNodeData = {
  label: string;
  sublabel?: string;
  storyId?: string;
  description?: string;
  kind: "root" | "feature" | "story" | "draft" | "done" | "blocked" | "pending_removal";
  connectable?: boolean;
  isRunning?: boolean;
  showDepHandles?: boolean;
  addable?: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
  childCount?: number;
  onAddFeature?: () => void;
  onAddStory?: () => void;
  onConfirmDraft?: () => void;
  confirmable?: boolean;
  onUnconfirmDraft?: () => void;
  unconfirmable?: boolean;
  onToggleCollapse?: () => void;
  onHeightChange?: (id: string, height: number) => void;
  renamable?: boolean;
  onRenameTitle?: (title: string) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isDropTarget?: boolean;
  isDragging?: boolean;
};

const NODE_W = 172;
/** 单行节点估算高度：padding×2 + border×2 + 一行 label */
const NODE_H_MIN = 54;
const ROOT_NODE_W = 220;
/** 根节点估算：padding×2 + border×2 + sublabel + label */
const ROOT_NODE_H_MIN = 72;
const H_GAP = 64;
/** 同级子树之间的垂直间距 */
const V_GAP = 32;

export const depEdgeMarker = (
  color: string,
  size: { width: number; height: number } = { width: 10, height: 10 }
) => ({
  type: MarkerType.ArrowClosed,
  color,
  width: size.width,
  height: size.height,
});

/** 依赖边默认/选中描边色（实线 + 半透明） */
export function depEdgeStrokeColor(selected: boolean): string {
  return selected ? "rgba(255, 229, 102, 0.85)" : "rgba(232, 148, 58, 0.45)";
}

export type NodeHeightMap = Readonly<Record<string, number>>;

function resolveHeight(
  id: string,
  kind: MindMapNodeData["kind"],
  heights: NodeHeightMap
): number {
  const measured = heights[id];
  if (measured && measured > 0) return measured;
  return kind === "root" ? ROOT_NODE_H_MIN : NODE_H_MIN;
}

function columnX(depth: number): number {
  if (depth <= 0) return 0;
  return ROOT_NODE_W + H_GAP + (depth - 1) * (NODE_W + H_GAP);
}

function subtreeHeightExpanded(
  node: TreeNode,
  heights: NodeHeightMap,
  collapsedIds: ReadonlySet<string>
): number {
  const kind = nodeKind(node);
  const selfH = resolveHeight(node.id, kind, heights);
  if (!node.children.length || collapsedIds.has(node.id)) return selfH;
  const kids = node.children.reduce(
    (sum, c) => sum + subtreeHeightExpanded(c, heights, collapsedIds) + V_GAP,
    -V_GAP
  );
  return Math.max(selfH, kids);
}

function descendantCount(node: TreeNode): number {
  return node.children.reduce((sum, c) => sum + 1 + descendantCount(c), 0);
}

function nodeKind(node: TreeNode): MindMapNodeData["kind"] {
  if (node.kind === "story") {
    if (node.removalRequested) return "pending_removal";
    if (node.passes) return "done";
    if (node.draft) return "draft";
    if (node.blocked) return "blocked";
    return "story";
  }
  return "feature";
}

function isStoryKind(kind: MindMapNodeData["kind"]) {
  return (
    kind === "story" ||
    kind === "draft" ||
    kind === "blocked" ||
    kind === "done" ||
    kind === "pending_removal"
  );
}

function nodeWidth(kind: MindMapNodeData["kind"]): number {
  return kind === "root" ? ROOT_NODE_W : NODE_W;
}

function placeNodes(
  items: TreeNode[],
  depth: number,
  topY: number,
  parentId: string | null,
  nodes: Node<MindMapNodeData>[],
  edges: Edge[],
  collapsedIds: ReadonlySet<string>,
  heights: NodeHeightMap
): void {
  let y = topY;
  for (const item of items) {
    const blockH = subtreeHeightExpanded(item, heights, collapsedIds);
    const x = columnX(depth);
    const kind = nodeKind(item);
    const nodeH = resolveHeight(item.id, kind, heights);
    const nodeY = y + blockH / 2 - nodeH / 2;
    const hasChildren = item.children.length > 0;
    const collapsed = collapsedIds.has(item.id);

    const isStory = item.kind === "story";
    const description =
      isStory && item.description.trim() ? item.description.trim() : undefined;

    nodes.push({
      id: item.id,
      type: "mindmap",
      position: { x, y: nodeY },
      width: nodeWidth(kind),
      height: nodeH,
      connectable: isStoryKind(kind),
      data: {
        label: item.title,
        storyId: isStory ? item.id : undefined,
        description,
        kind,
        connectable: isStoryKind(kind),
        collapsible: hasChildren,
        collapsed,
        childCount: hasChildren ? descendantCount(item) : 0,
      },
    });

    if (parentId) {
      edges.push({
        id: `tree:${parentId}->${item.id}`,
        source: parentId,
        target: item.id,
        sourceHandle: "tree",
        type: "smoothstep",
        selectable: false,
        deletable: false,
        style: { stroke: "var(--mm-edge)", strokeWidth: 2 },
      });
    }

    if (hasChildren && !collapsed) {
      placeNodes(
        item.children,
        depth + 1,
        y,
        item.id,
        nodes,
        edges,
        collapsedIds,
        heights
      );
    }

    y += blockH + V_GAP;
  }
}

function addDependencyEdges(
  dependencies: StoryDependency[],
  nodeIds: Set<string>,
  edges: Edge[]
): void {
  for (const { from, to } of dependencies) {
    if (!nodeIds.has(from) || !nodeIds.has(to)) continue;
    edges.push({
      id: `dep:${from}->${to}`,
      source: from,
      target: to,
      sourceHandle: "dep-out",
      targetHandle: "dep-in",
      type: "dep",
      selectable: true,
      deletable: true,
      interactionWidth: 18,
      markerEnd: depEdgeMarker(depEdgeStrokeColor(false)),
      zIndex: 1,
      data: { dep: true },
    });
  }
}

export function buildProjectMindMap(
  projectTitle: string,
  progressPct: number,
  roots: TreeNode[],
  dependencies: StoryDependency[] = [],
  collapsedIds: ReadonlySet<string> = new Set(),
  nodeHeights: NodeHeightMap = {}
): { nodes: Node<MindMapNodeData>[]; edges: Edge[]; height: number } {
  const rootId = MINDMAP_ROOT_ID;
  const rootKind = "root" as const;
  const rootCollapsed = collapsedIds.has(rootId);
  const rootChildCount = roots.reduce(
    (sum, r) => sum + 1 + descendantCount(r),
    0
  );
  const nodes: Node<MindMapNodeData>[] = [
    {
      id: rootId,
      type: "mindmap",
      position: { x: 0, y: 0 },
      selectable: true,
      connectable: false,
      data: {
        label: projectTitle,
        sublabel: `${progressPct}%`,
        kind: "root",
        connectable: false,
        collapsible: roots.length > 0,
        collapsed: rootCollapsed,
        childCount: rootChildCount,
      },
    },
  ];
  const edges: Edge[] = [];

  const expandedTotalH =
    roots.length > 0
      ? roots.reduce(
          (sum, r) =>
            sum + subtreeHeightExpanded(r, nodeHeights, collapsedIds) + V_GAP,
          -V_GAP
        )
      : resolveHeight(rootId, rootKind, nodeHeights);
  const rootH = resolveHeight(rootId, rootKind, nodeHeights);
  const rootY = Math.max(0, expandedTotalH / 2 - rootH / 2);
  nodes[0].position = { x: 0, y: rootY };
  nodes[0].width = ROOT_NODE_W;
  nodes[0].height = rootH;

  if (roots.length && !rootCollapsed) {
    placeNodes(roots, 1, 0, rootId, nodes, edges, collapsedIds, nodeHeights);
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  addDependencyEdges(dependencies, nodeIds, edges);

  const maxY = nodes.reduce((m, n) => {
    const kind = n.data.kind;
    const h = resolveHeight(n.id, kind, nodeHeights);
    return Math.max(m, n.position.y + h);
  }, NODE_H_MIN);
  return { nodes, edges, height: Math.max(280, maxY + 48) };
}

export const MINDMAP_ROOT_ID = "project:root";

export const MINDMAP_NODE_SIZE = { w: NODE_W, h: NODE_H_MIN };
export const MINDMAP_ROOT_SIZE = { w: ROOT_NODE_W, h: ROOT_NODE_H_MIN };

export function isDependencyEdge(edge: Edge): boolean {
  return Boolean(edge.id?.startsWith("dep:") || edge.data?.dep);
}

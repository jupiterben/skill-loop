import type { Node } from "@xyflow/react";
import type { MindMapNodeData } from "./mindmapLayout";
import { MINDMAP_ROOT_ID } from "./mindmapLayout";

export type ReparentableKind = "feature" | "story";

export function isReparentableKind(
  kind: MindMapNodeData["kind"] | undefined
): kind is ReparentableKind | "draft" | "blocked" | "done" | "pending_removal" {
  return (
    kind === "feature" ||
    kind === "story" ||
    kind === "draft" ||
    kind === "blocked" ||
    kind === "done" ||
    kind === "pending_removal"
  );
}

export function reparentItemKind(
  kind: ReparentableKind | "draft" | "blocked" | "done" | "pending_removal"
): ReparentableKind {
  return kind === "feature" ? "feature" : "story";
}

export function isDropTargetKind(kind: MindMapNodeData["kind"] | undefined) {
  return kind === "root" || kind === "feature";
}

function nodeRect(node: Node) {
  const w = node.width ?? node.measured?.width ?? 172;
  const h = node.height ?? node.measured?.height ?? 54;
  return {
    x: node.position.x,
    y: node.position.y,
    w,
    h,
  };
}

function pointInRect(
  x: number,
  y: number,
  rect: { x: number; y: number; w: number; h: number }
) {
  return (
    x >= rect.x &&
    x <= rect.x + rect.w &&
    y >= rect.y &&
    y <= rect.y + rect.h
  );
}

/** 拖曳节点中心落在哪些节点区域内 */
export function findNodesAtDragCenter(
  dragged: Node,
  nodes: Node[]
): Node[] {
  const draggedRect = nodeRect(dragged);
  const cx = draggedRect.x + draggedRect.w / 2;
  const cy = draggedRect.y + draggedRect.h / 2;

  return nodes.filter((n) => {
    if (n.id === dragged.id) return false;
    return pointInRect(cx, cy, nodeRect(n));
  });
}

/** 在重叠节点中优先选面积最小的 Feature，否则 Root */
export function resolveDropTargetId(
  intersections: Node[],
  draggedId: string
): string | null {
  const candidates = intersections.filter((n) => n.id !== draggedId);
  if (!candidates.length) return null;

  const features = candidates.filter(
    (n) => (n.data as MindMapNodeData).kind === "feature"
  );
  if (features.length) {
    const sorted = [...features].sort((a, b) => nodeArea(a) - nodeArea(b));
    return sorted[0]!.id;
  }

  const root = candidates.find((n) => n.id === MINDMAP_ROOT_ID);
  return root ? MINDMAP_ROOT_ID : null;
}

function nodeArea(node: Node): number {
  const w = node.width ?? node.measured?.width ?? 172;
  const h = node.height ?? node.measured?.height ?? 54;
  return w * h;
}

export function dropTargetToParentId(targetId: string): string | null {
  return targetId === MINDMAP_ROOT_ID ? null : targetId;
}

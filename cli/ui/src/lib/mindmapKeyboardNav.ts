import type { TreeNode } from "../types";
import { MINDMAP_ROOT_ID } from "./mindmapLayout";

export interface MindMapNavIndex {
  parent: ReadonlyMap<string, string>;
  children: ReadonlyMap<string, readonly string[]>;
  visible: ReadonlySet<string>;
}

export function buildMindMapNavIndex(
  roots: TreeNode[],
  collapsedIds: ReadonlySet<string>
): MindMapNavIndex {
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  const visible = new Set<string>([MINDMAP_ROOT_ID]);

  function walk(nodes: TreeNode[], parentId: string) {
    const childIds = nodes.map((n) => n.id);
    children.set(parentId, childIds);

    for (const node of nodes) {
      visible.add(node.id);
      parent.set(node.id, parentId);

      if (!collapsedIds.has(node.id) && node.children.length) {
        walk(node.children, node.id);
      } else {
        children.set(node.id, []);
      }
    }
  }

  if (!collapsedIds.has(MINDMAP_ROOT_ID)) {
    walk(roots, MINDMAP_ROOT_ID);
  } else {
    children.set(MINDMAP_ROOT_ID, []);
  }

  return { parent, children, visible };
}

export type NavDirection = "up" | "down" | "left" | "right";

function moveFrom(
  currentId: string,
  direction: NavDirection,
  index: MindMapNavIndex
): string | null {
  const { parent, children, visible } = index;

  switch (direction) {
    case "left": {
      const p = parent.get(currentId);
      return p && visible.has(p) ? p : null;
    }
    case "right": {
      const kids = children.get(currentId);
      const first = kids?.[0];
      return first && visible.has(first) ? first : null;
    }
    case "up":
    case "down": {
      const p = parent.get(currentId);
      if (!p) return null;
      const siblings = children.get(p);
      if (!siblings?.length) return null;
      const i = siblings.indexOf(currentId);
      if (i < 0) return null;
      const next = direction === "up" ? i - 1 : i + 1;
      if (next < 0 || next >= siblings.length) return null;
      const target = siblings[next];
      return visible.has(target) ? target : null;
    }
  }
}

export function navigateMindMapNode(
  currentId: string | null,
  direction: NavDirection,
  index: MindMapNavIndex
): string | null {
  const { visible } = index;

  let id = currentId && visible.has(currentId) ? currentId : MINDMAP_ROOT_ID;
  if (!visible.has(id)) return null;

  const next = moveFrom(id, direction, index);
  return next ?? id;
}

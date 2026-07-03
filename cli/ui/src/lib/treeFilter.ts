import type { TreeNode, UserStory } from "../types";

export const MILESTONE_NONE = "__none__";
/** Story 未绑定 Milestone 时的展示文案 */
export const MILESTONE_NONE_LABEL = "无";

/** 按 Milestone 筛选可见 Story；Feature 始终保留（含无 Story 的空 Feature） */
export function filterTreeByMilestone(
  roots: TreeNode[],
  stories: UserStory[],
  activeFilter: string | null
): TreeNode[] {
  if (!activeFilter) return roots;

  const byId = new Map(stories.map((s) => [s.id, s]));

  function storyVisible(storyId: string): boolean {
    const s = byId.get(storyId);
    if (!s) return true;
    const mid = s.milestoneId;
    if (!mid) return activeFilter === MILESTONE_NONE;
    return mid === activeFilter;
  }

  function walk(nodes: TreeNode[]): TreeNode[] {
    const out: TreeNode[] = [];
    for (const node of nodes) {
      if (node.kind === "story") {
        if (storyVisible(node.id)) out.push(node);
        continue;
      }
      const children = walk(node.children);
      out.push({ ...node, children });
    }
    return out;
  }

  return walk(roots);
}

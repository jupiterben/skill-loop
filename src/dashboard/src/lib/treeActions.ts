import type { DashboardData, SelectedMindMapNode } from "../types";
import { canArchiveStory, canDeleteFeature, canHardDeleteStory, canRequestRemoval } from "./deletable";

export type TreeAction = {
  kind: "delete-feature" | "delete-story" | "request-removal" | "archive";
  label: string;
  disabled?: boolean;
};

export function resolveTreeAction(
  node: SelectedMindMapNode, data: DashboardData, runningIds: ReadonlySet<string>,
): TreeAction | null {
  if (node.kind === "root") return null;
  if (node.kind === "feature") {
    return canDeleteFeature(node.id, data.features, data.userStories)
      ? { kind: "delete-feature", label: "删除 Feature" }
      : { kind: "delete-feature", label: "非空 Feature，需先移除子节点", disabled: true };
  }
  const story = data.userStories.find((item) => item.id === node.id);
  if (!story) return null;
  if (runningIds.has(story.id) || story.claimedBy) {
    return { kind: "delete-story", label: "Story 执行中，暂不可删除", disabled: true };
  }
  if (canHardDeleteStory(story.id, data.userStories, data.progress)) return { kind: "delete-story", label: "删除 Story" };
  if (canRequestRemoval(story, data.progress)) return { kind: "request-removal", label: "标记等待删除" };
  if (canArchiveStory(story, data.progress)) return { kind: "archive", label: "归档 Story" };
  return { kind: "delete-story", label: "当前状态不可删除", disabled: true };
}

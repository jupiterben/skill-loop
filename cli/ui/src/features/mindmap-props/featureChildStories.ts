import type { UserStory } from "../../types";

/** 某 Feature 下直接挂载的 Story，按 sortOrder 排序 */
export function featureChildStories(
  featureId: string,
  userStories: UserStory[]
): UserStory[] {
  return userStories
    .filter((s) => s.parentId === featureId && !s.archivedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

import type { Feature, UserStory } from "../../types";

export function featureHasChildFeatures(
  featureId: string,
  features: Feature[]
): boolean {
  return features.some((f) => f.parentId === featureId);
}

export function featureHasDirectStories(
  featureId: string,
  stories: UserStory[]
): boolean {
  return stories
    .filter((s) => !s.archivedAt)
    .some((s) => s.parentId === featureId);
}

/** 无子 Feature 且无直接挂载 Story 的叶子 Feature */
export function isEmptyLeafFeature(
  featureId: string,
  features: Feature[],
  stories: UserStory[]
): boolean {
  if (featureHasChildFeatures(featureId, features)) return false;
  if (featureHasDirectStories(featureId, stories)) return false;
  return true;
}

export const EMPTY_LEAF_FEATURE_HINT =
  "此 Feature 无可执行 Story，请补充 US 或使用 loop delete-feature 删除";

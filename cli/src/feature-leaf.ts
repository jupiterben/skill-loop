import type { Feature, UserStory } from "./types.js";
import { getActiveStories } from "./tree.js";

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
  return getActiveStories(stories).some((s) => s.parentId === featureId);
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

export function assertDeletableEmptyLeafFeature(
  featureId: string,
  features: Feature[],
  stories: UserStory[]
): void {
  if (!features.some((f) => f.id === featureId)) {
    throw new Error(`找不到 Feature: ${featureId}`);
  }
  if (featureHasChildFeatures(featureId, features)) {
    throw new Error(
      `无法删除 ${featureId}：仍存在子 Feature，请先删除或移走子 Feature`
    );
  }
  if (featureHasDirectStories(featureId, stories)) {
    throw new Error(
      `无法删除 ${featureId}：仍存在子 Story，请先删除或移走子 Story`
    );
  }
}

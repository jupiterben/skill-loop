import type { Feature, ProgressEntry, UserStory } from "../types";
import { isEmptyLeafFeature } from "../features/mindmap-props/emptyLeafFeature";

export function isActiveStory(story: UserStory): boolean {
  return !story.archivedAt;
}

export function storyHasProgress(
  storyId: string,
  progress: ProgressEntry[]
): boolean {
  return progress.some((e) => e.storyId === storyId);
}

/** 曾经完成过（含修改需求后 passes 已重置的 Story） */
export function storyEverCompleted(
  story: UserStory,
  progress: ProgressEntry[] = []
): boolean {
  if (Boolean(story.everCompleted || story.passes)) return true;
  return progress.some(
    (e) =>
      e.storyId === story.id && e.summary.includes("原已完成状态已重置")
  );
}

/** 曾完成、修改后又回到待实现/草稿队列 */
export function isReopenedCompletedStory(
  story: UserStory,
  progress: ProgressEntry[] = []
): boolean {
  return storyEverCompleted(story, progress) && !story.passes && isActiveStory(story);
}

export function canDeleteFeature(
  featureId: string,
  features: Feature[],
  stories: UserStory[]
): boolean {
  return isEmptyLeafFeature(featureId, features, stories);
}

export function canHardDeleteStory(
  storyId: string,
  stories: UserStory[],
  progress: ProgressEntry[]
): boolean {
  const story = stories.find((s) => s.id === storyId);
  return Boolean(
    story &&
      isActiveStory(story) &&
      !story.passes &&
      !storyEverCompleted(story, progress) &&
      !storyHasProgress(storyId, progress)
  );
}

export function canRequestRemoval(
  story: UserStory,
  progress: ProgressEntry[] = []
): boolean {
  return (
    isActiveStory(story) &&
    storyEverCompleted(story, progress) &&
    !story.removalRequestedAt
  );
}

export function canCancelRemoval(story: UserStory): boolean {
  return isActiveStory(story) && Boolean(story.removalRequestedAt);
}

export function canArchiveStory(
  story: UserStory,
  progress: ProgressEntry[]
): boolean {
  if (!isActiveStory(story)) return false;
  if (storyEverCompleted(story, progress)) {
    return Boolean(story.removalRequestedAt);
  }
  return storyHasProgress(story.id, progress);
}

export function canRestoreStory(story: UserStory): boolean {
  return Boolean(story.archivedAt);
}

export function canPurgeStory(story: UserStory): boolean {
  return Boolean(story.archivedAt);
}

/** @deprecated use canHardDeleteStory */
export function canDeleteStory(
  storyId: string,
  stories: UserStory[]
): boolean {
  const story = stories.find((s) => s.id === storyId);
  return Boolean(story && isActiveStory(story) && !story.passes);
}

export function isFormFieldFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable
  );
}

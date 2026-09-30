import type { Feature, UserStory } from "../types";
import { isActiveStory } from "./deletable";

function sortFeatures(a: Feature, b: Feature): number {
  return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}

function sortStories(a: UserStory, b: UserStory): number {
  return (
    a.priority - b.priority ||
    a.sortOrder - b.sortOrder ||
    a.id.localeCompare(b.id)
  );
}

export function featureReorderState(
  featureId: string,
  features: Feature[]
): { canMoveUp: boolean; canMoveDown: boolean } {
  const cur = features.find((f) => f.id === featureId);
  if (!cur) return { canMoveUp: false, canMoveDown: false };

  const siblings = features
    .filter((f) => f.parentId === cur.parentId)
    .sort(sortFeatures);
  const idx = siblings.findIndex((f) => f.id === featureId);
  return {
    canMoveUp: idx > 0,
    canMoveDown: idx >= 0 && idx < siblings.length - 1,
  };
}

export function storyReorderState(
  storyId: string,
  stories: UserStory[]
): { canMoveUp: boolean; canMoveDown: boolean } {
  const active = stories.filter(isActiveStory);
  const cur = active.find((s) => s.id === storyId);
  if (!cur) return { canMoveUp: false, canMoveDown: false };

  const siblings = active
    .filter((s) => s.parentId === cur.parentId)
    .sort(sortStories);
  const idx = siblings.findIndex((s) => s.id === storyId);
  return {
    canMoveUp: idx > 0,
    canMoveDown: idx >= 0 && idx < siblings.length - 1,
  };
}

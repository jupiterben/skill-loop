import type { StoryWorkType, UserStory } from "../../types";
import { normalizeStoryWorkType } from "../story-work-type/storyWorkType";
import { acceptanceCriteriaEqual } from "../../lib/acceptanceCriteria";

export function computeStoryEditDirty(
  local: { title: string; description: string; workType: StoryWorkType; acceptanceCriteria: string[] },
  story: UserStory,
): boolean {
  return local.title !== story.title ||
    local.description !== story.description ||
    local.workType !== normalizeStoryWorkType(story.workType, story.description) ||
    !acceptanceCriteriaEqual(local.acceptanceCriteria, story.acceptanceCriteria);
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UserStory } from "../types";
import {
  normalizeStoryWorkType,
  type StoryWorkType,
} from "../features/story-work-type/storyWorkType";
import {
  acceptanceCriteriaEqual,
  formatAcceptanceCriteria,
  parseAcceptanceCriteria,
} from "../lib/acceptanceCriteria";

export function computeStoryEditDirty(
  local: {
    title: string;
    description: string;
    workType: StoryWorkType;
    acceptanceCriteria: string[];
  },
  story: UserStory
): boolean {
  const serverWorkType = normalizeStoryWorkType(
    story.workType,
    story.description
  );
  return (
    local.title !== story.title ||
    local.description !== story.description ||
    local.workType !== serverWorkType ||
    !acceptanceCriteriaEqual(local.acceptanceCriteria, story.acceptanceCriteria)
  );
}

function cloneStory(story: UserStory): UserStory {
  return {
    ...story,
    dependsOn: [...(story.dependsOn ?? [])],
    acceptanceCriteria: [...story.acceptanceCriteria],
  };
}

export function useSyncedStoryFields(
  story: UserStory,
  onEditingChange?: (editing: boolean) => void
) {
  const storyIdRef = useRef(story.id);
  const [detachedSnapshot, setDetachedSnapshot] = useState<UserStory | null>(
    null
  );
  const isDetached = detachedSnapshot !== null;
  const viewStory = detachedSnapshot ?? story;

  const serverWorkType = normalizeStoryWorkType(
    story.workType,
    story.description
  );

  const [title, setTitleState] = useState(story.title);
  const [description, setDescriptionState] = useState(story.description);
  const [workType, setWorkTypeState] = useState(serverWorkType);
  const [acceptanceCriteria, setAcceptanceCriteriaState] = useState(() =>
    formatAcceptanceCriteria(story.acceptanceCriteria)
  );
  const [changeNote, setChangeNoteState] = useState("");

  const parsedAcceptanceCriteria = useMemo(
    () => parseAcceptanceCriteria(acceptanceCriteria),
    [acceptanceCriteria]
  );

  const dirty = useMemo(
    () =>
      computeStoryEditDirty(
        {
          title,
          description,
          workType,
          acceptanceCriteria: parsedAcceptanceCriteria,
        },
        story
      ),
    [title, description, workType, parsedAcceptanceCriteria, story]
  );

  const syncFromStory = useCallback((source: UserStory) => {
    const wt = normalizeStoryWorkType(source.workType, source.description);
    setTitleState(source.title);
    setDescriptionState(source.description);
    setWorkTypeState(wt);
    setAcceptanceCriteriaState(
      formatAcceptanceCriteria(source.acceptanceCriteria)
    );
  }, []);

  const releaseDetached = useCallback(() => {
    setDetachedSnapshot(null);
    onEditingChange?.(false);
  }, [onEditingChange]);

  const detach = useCallback(() => {
    setDetachedSnapshot((prev) => {
      if (prev) return prev;
      onEditingChange?.(true);
      return cloneStory(story);
    });
  }, [story, onEditingChange]);

  useEffect(() => {
    if (story.id !== storyIdRef.current) {
      storyIdRef.current = story.id;
      setDetachedSnapshot(null);
      onEditingChange?.(false);
      syncFromStory(story);
      setChangeNoteState("");
      return;
    }
    if (isDetached) return;
    syncFromStory(story);
  }, [
    story,
    story.id,
    story.title,
    story.description,
    story.workType,
    story.acceptanceCriteria,
    isDetached,
    syncFromStory,
    onEditingChange,
  ]);

  useEffect(() => {
    if (!isDetached || dirty) return;
    releaseDetached();
  }, [isDetached, dirty, releaseDetached]);

  const setTitle = useCallback(
    (value: string) => {
      detach();
      setTitleState(value);
    },
    [detach]
  );

  const setDescription = useCallback(
    (value: string) => {
      detach();
      setDescriptionState(value);
    },
    [detach]
  );

  const setWorkType = useCallback(
    (value: StoryWorkType) => {
      detach();
      setWorkTypeState(value);
    },
    [detach]
  );

  const setAcceptanceCriteria = useCallback(
    (value: string) => {
      detach();
      setAcceptanceCriteriaState(value);
    },
    [detach]
  );

  const setChangeNote = useCallback(
    (value: string) => {
      detach();
      setChangeNoteState(value);
    },
    [detach]
  );

  const cancelEdit = useCallback(() => {
    releaseDetached();
    syncFromStory(story);
    setChangeNoteState("");
  }, [releaseDetached, syncFromStory, story]);

  const resetAfterSave = useCallback(() => {
    setChangeNoteState("");
  }, []);

  return {
    title,
    setTitle,
    description,
    setDescription,
    workType,
    setWorkType,
    acceptanceCriteria,
    setAcceptanceCriteria,
    changeNote,
    setChangeNote,
    parsedAcceptanceCriteria,
    dirty,
    isDetached,
    viewStory,
    cancelEdit,
    resetAfterSave,
  };
}

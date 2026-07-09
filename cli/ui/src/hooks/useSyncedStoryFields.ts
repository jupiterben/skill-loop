import { useEffect, useMemo, useRef, useState } from "react";
import type { UserStory } from "../types";
import { normalizeStoryWorkType } from "../features/story-work-type/storyWorkType";
import {
  acceptanceCriteriaEqual,
  formatAcceptanceCriteria,
  parseAcceptanceCriteria,
} from "../lib/acceptanceCriteria";

export function useSyncedStoryFields(story: UserStory) {
  const [title, setTitle] = useState(story.title);
  const [description, setDescription] = useState(story.description);
  const [workType, setWorkType] = useState(story.workType);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(() =>
    formatAcceptanceCriteria(story.acceptanceCriteria)
  );
  const [changeNote, setChangeNote] = useState("");
  const storyIdRef = useRef(story.id);

  const parsedAcceptanceCriteria = useMemo(
    () => parseAcceptanceCriteria(acceptanceCriteria),
    [acceptanceCriteria]
  );

  const dirty =
    title.trim() !== story.title ||
    description !== story.description ||
    workType !== story.workType ||
    !acceptanceCriteriaEqual(parsedAcceptanceCriteria, story.acceptanceCriteria);

  useEffect(() => {
    if (story.id !== storyIdRef.current) {
      storyIdRef.current = story.id;
      setTitle(story.title);
      setDescription(story.description);
      setWorkType(story.workType);
      setAcceptanceCriteria(formatAcceptanceCriteria(story.acceptanceCriteria));
      setChangeNote("");
      return;
    }
    if (dirty) return;
    setTitle(story.title);
    setDescription(story.description);
    setWorkType(story.workType);
    setAcceptanceCriteria(formatAcceptanceCriteria(story.acceptanceCriteria));
  }, [
    story.id,
    story.title,
    story.description,
    story.workType,
    story.acceptanceCriteria,
    dirty,
  ]);

  const resetAfterSave = () => setChangeNote("");

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
    resetAfterSave,
  };
}

import type { Feature, Milestone } from "../../types";
import { isStoryWorkType, type StoryWorkType } from "../story-work-type/storyWorkType";
import { parseAcceptanceCriteria } from "../../lib/acceptanceCriteria";

export interface RequirementDraft {
  version: 1;
  kind: "story" | "feature";
  title: string;
  description: string;
  parentId: string;
  workType: StoryWorkType;
  acceptanceCriteria: string;
  milestoneId: string;
}

export function emptyRequirementDraft(): RequirementDraft {
  return {
    version: 1, kind: "story", title: "", description: "", parentId: "",
    workType: "implementation", acceptanceCriteria: "", milestoneId: "",
  };
}

export function requirementDraftKey(project: string): string {
  return `loop:requirement-draft:v1:${encodeURIComponent(project)}`;
}

export function parseRequirementDraft(raw: string | null): RequirementDraft {
  if (!raw) return emptyRequirementDraft();
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("无效的本机草稿");
  const value = parsed as Record<string, unknown>;
  if (value.version !== 1) throw new Error("无法读取此版本的本机草稿");
  const draft = emptyRequirementDraft();
  for (const key of ["title", "description", "parentId", "acceptanceCriteria", "milestoneId"] as const) {
    if (typeof value[key] !== "string") throw new Error("本机草稿格式不完整");
    draft[key] = value[key];
  }
  draft.kind = value.kind === "feature" ? "feature" : "story";
  draft.workType = typeof value.workType === "string" && isStoryWorkType(value.workType)
    ? value.workType : "implementation";
  return draft;
}

export function buildRequirementInput(
  draft: RequirementDraft, features: Feature[], milestones: Milestone[]
) {
  if (!draft.title.trim()) throw new Error("请填写需求标题");
  if (draft.parentId && !features.some((feature) => feature.id === draft.parentId)) {
    throw new Error("所属 Feature 已不存在，请重新选择");
  }
  if (draft.kind === "story" && draft.milestoneId &&
      !milestones.some((milestone) => milestone.id === draft.milestoneId)) {
    throw new Error("Milestone 已不存在，请重新选择");
  }
  const base = {
    title: draft.title.trim(),
    description: draft.description.trim(),
    parentId: draft.parentId || null,
  };
  if (draft.kind === "feature") return { kind: "feature" as const, input: base };
  return {
    kind: "story" as const,
    input: {
      ...base,
      workType: draft.workType,
      acceptanceCriteria: parseAcceptanceCriteria(draft.acceptanceCriteria),
      milestoneId: draft.milestoneId || null,
    },
  };
}

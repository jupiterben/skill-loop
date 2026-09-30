import { describe, expect, it } from "vitest";
import {
  buildRequirementInput, emptyRequirementDraft, parseRequirementDraft, requirementDraftKey,
} from "./requirementDraft";
import type { Feature, Milestone } from "../../types";

const features: Feature[] = [{ id: "FT-001", title: "Login", description: "", parentId: null, sortOrder: 0 }];
const milestones: Milestone[] = [{ id: "MS-001", title: "MVP", description: "", sortOrder: 0 }];

describe("persistent requirement drafts", () => {
  it("creates independent empty drafts", () => {
    const first = emptyRequirementDraft();
    first.title = "changed";
    expect(emptyRequirementDraft().title).toBe("");
    expect(parseRequirementDraft(null)).toEqual(emptyRequirementDraft());
  });
  it("preserves exact text including whitespace, line breaks and Chinese", () => {
    const draft = { ...emptyRequirementDraft(), title: " 登录需求 ", description: "第一行\n\n  第二行", parentId: "FT-001" };
    expect(parseRequirementDraft(JSON.stringify(draft))).toEqual(draft);
  });
  it("isolates projects even if their names are the same", () => {
    expect(requirementDraftKey("C:/one/project")).not.toBe(requirementDraftKey("C:/two/project"));
  });
  it.each(["broken", "null", "[]", '{"version":2}', '{"version":1,"title":42}'])(
    "rejects damaged or incompatible storage: %s", (raw) => {
      expect(() => parseRequirementDraft(raw)).toThrow();
    }
  );
  it("retains data while defaulting an unknown work type", () => {
    const draft = { ...emptyRequirementDraft(), title: "Read me", workType: "old-type" };
    expect(parseRequirementDraft(JSON.stringify(draft))).toMatchObject({ title: "Read me", workType: "implementation" });
  });
  it("builds a draft Story without approving it for execution", () => {
    const draft = {
      ...emptyRequirementDraft(), title: " Login ", description: " Details ",
      acceptanceCriteria: "first\n\nsecond", parentId: "FT-001", milestoneId: "MS-001",
    };
    expect(buildRequirementInput(draft, features, milestones)).toEqual({
      kind: "story",
      input: {
        title: "Login", description: "Details", parentId: "FT-001",
        milestoneId: "MS-001", workType: "implementation", acceptanceCriteria: ["first", "second"],
      },
    });
    expect(draft.title).toBe(" Login ");
  });
  it("does not leak Story-only fields into a Feature", () => {
    const draft = { ...emptyRequirementDraft(), kind: "feature" as const, title: "Feature", description: "Details", milestoneId: "deleted" };
    expect(buildRequirementInput(draft, [], [])).toEqual({
      kind: "feature", input: { title: "Feature", description: "Details", parentId: null },
    });
  });
  it("validates whitespace-only titles", () => {
    expect(() => buildRequirementInput({ ...emptyRequirementDraft(), title: "  " }, [], [])).toThrow("标题");
  });
  it("preserves user choice when its parent was removed, instead of silently moving to root", () => {
    const draft = { ...emptyRequirementDraft(), title: "Story", parentId: "FT-deleted" };
    expect(() => buildRequirementInput(draft, features, milestones)).toThrow("Feature");
    expect(draft.parentId).toBe("FT-deleted");
  });
  it("rejects a removed milestone", () => {
    expect(() => buildRequirementInput({ ...emptyRequirementDraft(), title: "Story", milestoneId: "deleted" }, features, milestones)).toThrow("Milestone");
  });
});

import { describe, expect, it } from "vitest";
import { computeStoryEditDirty } from "../../hooks/useSyncedStoryFields";
import type { UserStory } from "../../types";

function makeStory(overrides: Partial<UserStory> = {}): UserStory {
  return {
    id: "US-001",
    parentId: "FT-001",
    title: "标题",
    description: "描述",
    acceptanceCriteria: ["AC1"],
    priority: 0,
    passes: false,
    everCompleted: false,
    status: "ready",
    notes: "",
    sortOrder: 0,
    removalRequestedAt: null,
    archivedAt: null,
    claimedBy: null,
    claimedAt: null,
    workType: "implementation",
    dependsOn: [],
    milestoneId: null,
    ...overrides,
  };
}

describe("computeStoryEditDirty", () => {
  it("标题有任意差异即视为脏数据", () => {
    const story = makeStory({ title: "原标题" });
    expect(
      computeStoryEditDirty(
        {
          title: "原标题 ",
          description: story.description,
          workType: "implementation",
          acceptanceCriteria: story.acceptanceCriteria,
        },
        story
      )
    ).toBe(true);
  });

  it("未修改时与服务器数据一致", () => {
    const story = makeStory();
    expect(
      computeStoryEditDirty(
        {
          title: story.title,
          description: story.description,
          workType: "implementation",
          acceptanceCriteria: story.acceptanceCriteria,
        },
        story
      )
    ).toBe(false);
  });

  it("workType 按规范化后的值比较", () => {
    const story = makeStory({ workType: undefined, description: "类型：文档补全" });
    expect(
      computeStoryEditDirty(
        {
          title: story.title,
          description: story.description,
          workType: "implementation",
          acceptanceCriteria: story.acceptanceCriteria,
        },
        story
      )
    ).toBe(true);
  });
});

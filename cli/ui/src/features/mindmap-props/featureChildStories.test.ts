import { describe, expect, it } from "vitest";
import { featureChildStories } from "./featureChildStories";
import type { UserStory } from "../../types";

function story(
  partial: Partial<UserStory> & Pick<UserStory, "id" | "parentId">
): UserStory {
  return {
    milestoneId: null,
    dependsOn: [],
    title: partial.id,
    description: "",
    workType: "implementation",
    acceptanceCriteria: [],
    priority: 0,
    passes: false,
    status: "draft",
    notes: "",
    sortOrder: 0,
    removalRequestedAt: null,
    archivedAt: null,
    ...partial,
  };
}

describe("featureChildStories", () => {
  it("returns direct child stories sorted by sortOrder", () => {
    const stories = [
      story({ id: "US-002", parentId: "FT-001", sortOrder: 2 }),
      story({ id: "US-001", parentId: "FT-001", sortOrder: 1 }),
      story({ id: "US-003", parentId: "FT-002", sortOrder: 0 }),
    ];
    expect(featureChildStories("FT-001", stories).map((s) => s.id)).toEqual([
      "US-001",
      "US-002",
    ]);
  });

  it("excludes archived stories", () => {
    const stories = [
      story({
        id: "US-001",
        parentId: "FT-001",
        archivedAt: "2026-01-01T00:00:00.000Z",
      }),
    ];
    expect(featureChildStories("FT-001", stories)).toEqual([]);
  });
});

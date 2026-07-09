import { describe, expect, it } from "vitest";
import {
  DEFAULT_STORY_WORK_TYPE,
  inferWorkTypeFromDescription,
  normalizeStoryWorkType,
} from "./storyWorkType";

describe("storyWorkType", () => {
  it("infers workType from description prefix", () => {
    expect(
      inferWorkTypeFromDescription("类型：代码实现。作为用户，我需要…")
    ).toBe("implementation");
    expect(
      inferWorkTypeFromDescription("类型：文档补全（已实现能力建档）。")
    ).toBe("documentation");
    expect(inferWorkTypeFromDescription("类型：规划/PRD。调整结构。")).toBe(
      "planning"
    );
  });

  it("normalizes missing workType from description or default", () => {
    expect(
      normalizeStoryWorkType(undefined, "类型：测试补充。补充测试。")
    ).toBe("testing");
    expect(normalizeStoryWorkType(undefined, "无类型前缀")).toBe(
      DEFAULT_STORY_WORK_TYPE
    );
    expect(normalizeStoryWorkType("refactor", "类型：代码实现")).toBe(
      "refactor"
    );
  });
});

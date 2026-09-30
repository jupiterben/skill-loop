import { describe, expect, it } from "vitest";
import { milestoneFilterMeta, milestoneFullLabel } from "./milestoneLabel";

describe("milestoneLabel", () => {
  it("筛选栏 meta 优先版本", () => {
    expect(
      milestoneFilterMeta({ version: "v0.1", targetDate: "2026-07-15" })
    ).toBe("v0.1");
  });

  it("筛选栏 meta 无版本时用目标日期", () => {
    expect(milestoneFilterMeta({ targetDate: "2026-07-15" })).toBe("2026-07-15");
  });

  it("完整标签拼接版本与日期", () => {
    expect(
      milestoneFullLabel({
        id: "MS-001",
        title: "发布",
        description: "",
        version: "v1.0",
        targetDate: "2026-12-31",
        sortOrder: 0,
      })
    ).toBe("发布 (v1.0 · 2026-12-31)");
  });
});

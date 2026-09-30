import { describe, expect, it } from "vitest";
import { needsExpand, patternPreview } from "./patternPreview";

describe("patternPreview", () => {
  it("returns empty for blank content", () => {
    expect(patternPreview("   ")).toBe("");
    expect(needsExpand("   ")).toBe(false);
  });

  it("truncates long content with ellipsis", () => {
    const long = "a".repeat(250);
    expect(patternPreview(long, 200)).toBe(`${"a".repeat(200)}…`);
    expect(needsExpand(long, 200)).toBe(true);
  });

  it("keeps short content intact", () => {
    const short = "Dashboard 用 antd Splitter";
    expect(patternPreview(short)).toBe(short);
    expect(needsExpand(short)).toBe(false);
  });
});

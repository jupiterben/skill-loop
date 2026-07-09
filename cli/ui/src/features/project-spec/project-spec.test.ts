import { describe, expect, it } from "vitest";
import {
  getProjectSpecTemplate,
  PROJECT_SPEC_TEMPLATES,
} from "../../../../src/project-spec-templates";

describe("project-spec-templates", () => {
  it("包含至少 4 套内置模板", () => {
    expect(PROJECT_SPEC_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    const ids = PROJECT_SPEC_TEMPLATES.map((t) => t.id);
    expect(ids).toContain("general");
    expect(ids).toContain("typescript-react");
    expect(ids).toContain("python-backend");
    expect(ids).toContain("loop-agent");
  });

  it("getProjectSpecTemplate 按 id 查找", () => {
    const t = getProjectSpecTemplate("general");
    expect(t?.title).toBe("通用工程规范");
    expect(t?.content).toMatch(/代码质量/);
    expect(getProjectSpecTemplate("missing")).toBeUndefined();
  });
});

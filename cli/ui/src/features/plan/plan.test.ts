import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPlannerPrompt,
  resolvePlannerPromptPath,
} from "../../../../src/loop-plan.js";

describe("需求规划命令", () => {
  const roots: string[] = [];
  const prevPlannerPrompt = process.env.LOOP_PLANNER_PROMPT;

  afterEach(() => {
    if (prevPlannerPrompt === undefined) {
      delete process.env.LOOP_PLANNER_PROMPT;
    } else {
      process.env.LOOP_PLANNER_PROMPT = prevPlannerPrompt;
    }
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createProjectRoot() {
    const root = mkdtempSync(join(tmpdir(), "loop-plan-"));
    roots.push(root);
    mkdirSync(join(root, "loop-data"), { recursive: true });
    return root;
  }

  it("resolvePlannerPromptPath 优先使用 LOOP_PLANNER_PROMPT 环境变量", () => {
    const root = createProjectRoot();
    const custom = join(root, "custom-planner.md");
    writeFileSync(custom, "# custom");
    process.env.LOOP_PLANNER_PROMPT = custom;

    expect(resolvePlannerPromptPath(root)).toBe(custom);
  });

  it("resolvePlannerPromptPath 其次使用 loop-data/PLANNER.md", () => {
    const root = createProjectRoot();
    delete process.env.LOOP_PLANNER_PROMPT;
    const inProject = join(root, "loop-data", "PLANNER.md");
    writeFileSync(inProject, "# project planner");

    expect(resolvePlannerPromptPath(root)).toBe(inProject);
  });

  it("resolvePlannerPromptPath 回退到内置 templates/PLANNER.md", () => {
    const root = createProjectRoot();
    delete process.env.LOOP_PLANNER_PROMPT;

    const path = resolvePlannerPromptPath(root);
    expect(path).toMatch(/templates[/\\]PLANNER\.md$/);
  });

  it("buildPlannerPrompt 注入 story-id 与 requirement", () => {
    const root = createProjectRoot();
    const basePath = join(root, "planner.md");
    writeFileSync(basePath, "# Planner base");

    const prompt = buildPlannerPrompt(basePath, {
      storyId: "US-020",
      requirement: "拆分登录模块",
    });

    expect(prompt).toContain("# Planner base");
    expect(prompt).toContain("## 本轮输入");
    expect(prompt).toContain("US-020");
    expect(prompt).toContain("拆分登录模块");
  });

  it("buildPlannerPrompt 无额外输入时不追加本轮输入节", () => {
    const root = createProjectRoot();
    const basePath = join(root, "planner.md");
    writeFileSync(basePath, "# Planner only");

    const prompt = buildPlannerPrompt(basePath, {});
    expect(prompt).toBe("# Planner only\n");
    expect(prompt).not.toContain("## 本轮输入");
  });
});

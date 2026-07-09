import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import type { ProjectStatus } from "../../types";
import { resolveAppToolbarView } from "./appToolbarView";

const here = dirname(fileURLToPath(import.meta.url));

describe("顶栏项目概览（AppToolbar）", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createEmptyRoot() {
    const root = mkdtempSync(join(tmpdir(), "loop-app-toolbar-"));
    roots.push(root);
    return root;
  }

  function baseStatus(overrides: Partial<ProjectStatus> = {}): ProjectStatus {
    return {
      project: "skill-loop",
      branchName: "main",
      description: "",
      totalStories: 10,
      completedStories: 6,
      pendingStories: 4,
      readyStories: 4,
      draftStories: 1,
      blockedStories: 0,
      totalFeatures: 3,
      totalMilestones: 0,
      isComplete: false,
      nextStory: {
        id: "US-030",
        title: "Next",
        passes: false,
        status: "ready",
      },
      currentStory: null,
      patterns: [],
      activeRun: null,
      lastProgress: null,
      ...overrides,
    };
  }

  it("展示项目名、分支、完成/待做/草稿数与进度百分比", () => {
    const view = resolveAppToolbarView(baseStatus());
    expect(view).toEqual({
      project: "skill-loop",
      branchName: "main",
      completed: 6,
      pending: 4,
      blocked: 0,
      drafts: 1,
      total: 10,
      progressPct: 60,
      showRunning: false,
      showComplete: false,
    });
  });

  it("有 activeRun 时显示运行中状态", () => {
    const view = resolveAppToolbarView(
      baseStatus({
        activeRun: {
          iteration: 3,
          tool: "agent",
          storyId: "US-037",
          status: "running",
          message: null,
          startedAt: "",
          endedAt: null,
        },
      })
    );
    expect(view.showRunning).toBe(true);
    expect(view.showComplete).toBe(false);
  });

  it("activeRuns 多 worker 时同样显示运行中", () => {
    const view = resolveAppToolbarView(
      baseStatus({
        activeRuns: [
          {
            iteration: 1,
            tool: "agent",
            storyId: "US-030",
            workerId: "w0",
            status: "running",
            message: null,
            startedAt: "",
            endedAt: null,
          },
          {
            iteration: 1,
            tool: "agent",
            storyId: "US-031",
            workerId: "w1",
            status: "running",
            message: null,
            startedAt: "",
            endedAt: null,
          },
        ],
      })
    );
    expect(view.showRunning).toBe(true);
  });

  it("全部完成时显示完成标记", () => {
    const view = resolveAppToolbarView(
      baseStatus({
        isComplete: true,
        completedStories: 10,
        pendingStories: 0,
        draftStories: 0,
        nextStory: null,
      })
    );
    expect(view.showComplete).toBe(true);
    expect(view.progressPct).toBe(100);
  });

  it("顶栏数据与 db.getStatus 聚合结果一致", () => {
    const root = createEmptyRoot();
    const db = new LoopStateDb(root);
    db.upsertProject({
      name: "demo",
      branchName: "feature/x",
      description: "",
    });
    db.addFeature("demo", { title: "F1", description: "" });
    const feature = db.getFeatures("demo")[0]!;
    db.addStory("demo", {
      parentId: feature.id,
      title: "S1",
      description: "",
      acceptanceCriteria: ["AC"],
      status: "ready",
    });
    db.addStory("demo", {
      parentId: feature.id,
      title: "S2",
      description: "",
      acceptanceCriteria: ["AC"],
      status: "draft",
    });
    db.completeStoryWithProgress("demo", "US-001", { summary: "done" });

    const status = db.getStatus("demo");
    const view = resolveAppToolbarView(status);
    expect(view.project).toBe(status.project);
    expect(view.branchName).toBe(status.branchName);
    expect(view.completed).toBe(status.completedStories);
    expect(view.pending).toBe(status.pendingStories);
    expect(view.drafts).toBe(status.draftStories);
    expect(view.blocked).toBe(status.blockedStories);
    expect(view.total).toBe(status.totalStories);
    expect(view.progressPct).toBe(
      Math.round((status.completedStories / status.totalStories) * 100)
    );
  });

  it("App.tsx 将 status 传入 AppToolbar", () => {
    const appSrc = readFileSync(join(here, "../../App.tsx"), "utf8");
    expect(appSrc).toContain(
      'import { AppToolbar } from "./components/AppToolbar"'
    );
    expect(appSrc).toContain("<AppToolbar status={status} />");
  });

  it("AppToolbar 使用 resolveAppToolbarView 渲染统计与运行态", () => {
    const toolbarSrc = readFileSync(
      join(here, "../../components/AppToolbar.tsx"),
      "utf8"
    );
    expect(toolbarSrc).toContain("resolveAppToolbarView");
    expect(toolbarSrc).toContain("app-toolbar__project");
    expect(toolbarSrc).toContain("app-toolbar__tag--branch");
    expect(toolbarSrc).toContain("运行中");
    expect(toolbarSrc).toContain("全部完成");
    expect(toolbarSrc).toContain("app-toolbar__progress-pct");
  });
});

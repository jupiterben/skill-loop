import { readFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import type { DashboardData } from "../../types";
import {
  isLoopProcessRunning,
  resolveRunningStoryIds,
} from "../../lib/runningStories";
import { buildProjectTreeData } from "../../lib/treeViewData";

const here = dirname(fileURLToPath(import.meta.url));

function baseDashboard(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    projectName: "demo",
    status: {
      project: "demo",
      branchName: "main",
      description: "",
      totalStories: 3,
      completedStories: 1,
      pendingStories: 2,
      readyStories: 2,
      draftStories: 0,
      blockedStories: 0,
      totalFeatures: 1,
      totalMilestones: 0,
      isComplete: false,
      nextStory: null,
      currentStory: null,
      patterns: [],
      activeRun: null,
      lastProgress: null,
    },
    userStories: [
      { id: "US-001", title: "Done", passes: true, status: "ready" },
      { id: "US-002", title: "WIP A", passes: false, status: "ready" },
      { id: "US-003", title: "WIP B", passes: false, status: "ready" },
    ],
    archivedStories: [],
    milestones: [],
    features: [],
    tree: [
      {
        id: "FT-001",
        title: "Feature",
        kind: "feature",
        children: [
          {
            id: "US-001",
            title: "Done",
            kind: "story",
            children: [],
          },
          {
            id: "US-002",
            title: "WIP A",
            kind: "story",
            children: [],
          },
          {
            id: "US-003",
            title: "WIP B",
            kind: "story",
            children: [],
          },
        ],
      },
    ],
    dependencies: [],
    patterns: [],
    projectSpec: { content: "", templateId: null, updatedAt: null },
    projectSpecTemplates: [],
    progress: [],
    runs: [],
    loopRunner: { running: false, stopRequested: false, state: null },
    ...overrides,
  };
}

describe("运行中 Story 高亮", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  it("activeRun 时解析出正在执行的 Story ID", () => {
    const data = baseDashboard({
      status: {
        ...baseDashboard().status,
        activeRun: {
          iteration: 1,
          tool: "agent",
          storyId: "US-002",
          status: "running",
          message: null,
          startedAt: "",
          endedAt: null,
        },
      },
    });
    expect(resolveRunningStoryIds(data)).toEqual(new Set(["US-002"]));
    expect(isLoopProcessRunning(data)).toBe(true);
  });

  it("activeRuns 多 worker 时同时高亮多个 Story", () => {
    const data = baseDashboard({
      status: {
        ...baseDashboard().status,
        activeRuns: [
          {
            iteration: 1,
            tool: "agent",
            storyId: "US-002",
            workerId: "w0",
            status: "running",
            message: null,
            startedAt: "",
            endedAt: null,
          },
          {
            iteration: 1,
            tool: "agent",
            storyId: "US-003",
            workerId: "w1",
            status: "running",
            message: null,
            startedAt: "",
            endedAt: null,
          },
        ],
      },
    });
    expect(resolveRunningStoryIds(data)).toEqual(new Set(["US-002", "US-003"]));
  });

  it("结构树 meta.running 标记运行中 Story", () => {
    const runningIds = new Set(["US-002", "US-003"]);
    const treeData = buildProjectTreeData(
      "demo",
      33,
      baseDashboard().tree,
      runningIds
    );
    const stories = treeData[0]?.children?.[0]?.children ?? [];
    const us002 = stories.find((n) => n.key === "US-002");
    const us003 = stories.find((n) => n.key === "US-003");
    const us001 = stories.find((n) => n.key === "US-001");
    expect(us002?.meta.running).toBe(true);
    expect(us003?.meta.running).toBe(true);
    expect(us001?.meta.running).toBeFalsy();
  });

  it("db.getStatus activeRuns 与 resolveRunningStoryIds 一致", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-running-highlight-"));
    roots.push(root);
    mkdirSync(join(root, "loop-data"), { recursive: true });
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    db.addFeature("demo", { title: "F", description: "" });
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
      status: "ready",
    });
    db.startRun("demo", 1, "agent", "US-001", "w0");
    db.startRun("demo", 1, "agent", "US-002", "w1");

    const status = db.getStatus("demo");
    const data = baseDashboard({
      status,
      userStories: db.getActiveStories("demo"),
    });
    expect(resolveRunningStoryIds(data)).toEqual(new Set(["US-001", "US-002"]));
  });

  it("App.tsx 将 runningStoryIds 传入 MindMapPanel", () => {
    const appSrc = readFileSync(join(here, "../../App.tsx"), "utf8");
    expect(appSrc).toContain("resolveRunningStoryIds");
    expect(appSrc).toContain("runningStoryIds={[...runningStoryIds]}");
  });

  it("脑图节点与结构树有运行中 visual state", () => {
    const mindMapNodeSrc = readFileSync(
      join(here, "../../components/MindMapNode.tsx"),
      "utf8"
    );
    expect(mindMapNodeSrc).toContain("mm-node--running");
    expect(mindMapNodeSrc).toContain("mm-node__running-badge");
    expect(mindMapNodeSrc).toContain("执行中");

    const treeViewSrc = readFileSync(
      join(here, "../../components/ProjectTreeView.tsx"),
      "utf8"
    );
    expect(treeViewSrc).toContain("project-tree-view__title--running");
    expect(treeViewSrc).toContain("project-tree-view__running");
    expect(treeViewSrc).toContain("运行中");

    const cssSrc = readFileSync(join(here, "../../index.css"), "utf8");
    expect(cssSrc).toContain(".mm-node--running");
    expect(cssSrc).toContain(".project-tree-view__running");
  });

  it("MindMapPanel 将 runningIds 传给 ProjectTreeView 并设置 isRunning", () => {
    const panelSrc = readFileSync(
      join(here, "../../components/MindMapPanel.tsx"),
      "utf8"
    );
    expect(panelSrc).toContain("runningStoryIds");
    expect(panelSrc).toContain("isRunning: runningIds.has(n.id)");
    expect(panelSrc).toContain("runningIds={runningIds}");
  });
});

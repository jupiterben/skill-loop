import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProjectStatus } from "../../types";
import { resolveWorkspaceStatusView } from "./workspaceStatus";

const here = dirname(fileURLToPath(import.meta.url));

function baseStatus(overrides: Partial<ProjectStatus> = {}): ProjectStatus {
  return {
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
    nextStory: {
      id: "US-002",
      title: "Next task",
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

describe("工作区执行状态栏（WorkspaceStatusBar）", () => {
  it("就绪态展示下一待执行 Story", () => {
    const view = resolveWorkspaceStatusView(baseStatus(), [], {
      running: false,
      stopRequested: false,
    });
    expect(view).toEqual({
      kind: "ready",
      nextId: "US-002",
      nextTitle: "Next task",
    });
  });

  it("无 activeRun 且无 loopRunner 时展示空闲就绪", () => {
    const view = resolveWorkspaceStatusView(
      baseStatus({ nextStory: null, isComplete: false }),
      []
    );
    expect(view).toEqual({ kind: "idle" });
  });

  it("全部完成时展示完成标签", () => {
    const view = resolveWorkspaceStatusView(
      baseStatus({
        isComplete: true,
        completedStories: 3,
        pendingStories: 0,
        nextStory: null,
      }),
      []
    );
    expect(view).toEqual({ kind: "complete" });
  });

  it("单 worker 运行中展示 Story 与轮次元信息", () => {
    const view = resolveWorkspaceStatusView(
      baseStatus({
        currentStory: {
          id: "US-029",
          title: "工作区执行状态栏",
          passes: false,
          status: "ready",
        },
        activeRun: {
          iteration: 12,
          tool: "agent",
          storyId: "US-029",
          workerId: "w0",
          status: "running",
          message: null,
          startedAt: "",
          endedAt: null,
        },
      }),
      [{ id: "US-029", title: "工作区执行状态栏", passes: false, status: "ready" }],
      { running: true, stopRequested: false }
    );
    expect(view).toEqual({
      kind: "running",
      storyId: "US-029",
      title: "工作区执行状态栏",
      iteration: 12,
      tool: "agent",
      workerId: "w0",
      stopRequested: false,
    });
  });

  it("并行 worker 运行中展示多 Story 列表", () => {
    const view = resolveWorkspaceStatusView(
      baseStatus({
        activeRuns: [
          {
            iteration: 2,
            tool: "agent",
            storyId: "US-030",
            workerId: "w0",
            status: "running",
            message: null,
            startedAt: "",
            endedAt: null,
          },
          {
            iteration: 2,
            tool: "agent",
            storyId: "US-031",
            workerId: "w1",
            status: "running",
            message: null,
            startedAt: "",
            endedAt: null,
          },
        ],
      }),
      [
        { id: "US-030", title: "A", passes: false, status: "ready" },
        { id: "US-031", title: "B", passes: false, status: "ready" },
      ],
      { running: true, stopRequested: false }
    );
    expect(view).toEqual({
      kind: "parallel",
      stopRequested: false,
      items: [
        { workerId: "w0", storyId: "US-030", title: "A" },
        { workerId: "w1", storyId: "US-031", title: "B" },
      ],
    });
  });

  it("停止请求时 stopRequested 为 true", () => {
    const view = resolveWorkspaceStatusView(
      baseStatus({
        currentStory: {
          id: "US-029",
          title: "Status",
          passes: false,
          status: "ready",
        },
        activeRun: {
          iteration: 1,
          tool: "agent",
          storyId: "US-029",
          status: "running",
          message: null,
          startedAt: "",
          endedAt: null,
        },
      }),
      [],
      { running: true, stopRequested: true }
    );
    expect(view).toMatchObject({ kind: "running", stopRequested: true });
  });

  it("仅 loopRunner 运行且无 Story 详情时展示外循环运行中", () => {
    const view = resolveWorkspaceStatusView(baseStatus(), [], {
      running: true,
      stopRequested: false,
    });
    expect(view).toEqual({ kind: "runner-only", stopRequested: false });
  });

  it("Dashboard 聚合接口提供 loopRunner 与 status", () => {
    const handlers = readFileSync(
      join(here, "../../../../src/http-handlers.ts"),
      "utf8"
    );
    expect(handlers).toContain("loopRunner: getLoopRunStatus(projectRoot)");
    expect(handlers).toContain("status,");
  });

  it("App.tsx 将 status 与 loopRunner 传入 WorkspaceStatusBar", () => {
    const appSrc = readFileSync(join(here, "../../App.tsx"), "utf8");
    expect(appSrc).toContain(
      'import { WorkspaceStatusBar } from "./components/WorkspaceStatusBar"'
    );
    expect(appSrc).toContain("<WorkspaceStatusBar");
    expect(appSrc).toContain("status={status}");
    expect(appSrc).toContain("loopRunner={data.loopRunner}");

    const barSrc = readFileSync(
      join(here, "../../components/WorkspaceStatusBar.tsx"),
      "utf8"
    );
    expect(barSrc).toContain('role="status"');
    expect(barSrc).toContain("workspace-status__content");
    expect(barSrc).toContain("并行执行中");
    expect(barSrc).toContain("全部 Story 已完成");
    expect(barSrc).toContain("已请求停止");
  });
});

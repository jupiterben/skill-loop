import { describe, expect, it } from "vitest";
import type { DashboardData } from "../types";
import { isLoopProcessRunning, resolveRunningStoryIds } from "./runningStories";

function baseData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    projectName: "demo",
    status: {
      project: "demo",
      branchName: "main",
      description: "",
      totalStories: 1,
      completedStories: 1,
      pendingStories: 0,
      readyStories: 0,
      draftStories: 0,
      blockedStories: 0,
      totalFeatures: 0,
      totalMilestones: 0,
      isComplete: true,
      nextStory: null,
      currentStory: {
        id: "US-001",
        title: "Done",
        passes: true,
        status: "ready",
      },
      patterns: [],
      activeRun: {
        iteration: 1,
        tool: "agent",
        storyId: "US-001",
        status: "running",
        message: null,
        startedAt: "",
        endedAt: null,
      },
      lastProgress: null,
    },
    userStories: [
      {
        id: "US-001",
        title: "Done",
        passes: true,
        status: "ready",
      },
    ],
    archivedStories: [],
    milestones: [],
    features: [],
    tree: [],
    dependencies: [],
    patterns: [],
    projectSpec: { content: "", templateId: null, updatedAt: null },
    projectSpecTemplates: [],
    progress: [],
    runs: [],
    loopRunner: {
      running: true,
      stopRequested: false,
      state: { currentStoryId: "US-001" },
      workers: [{ currentStoryId: "US-001" }],
    },
    ...overrides,
  };
}

describe("resolveRunningStoryIds", () => {
  it("ignores stale active run when story already completed", () => {
    const data = baseData({
      loopRunner: { running: false, stopRequested: false, state: null },
    });
    expect(resolveRunningStoryIds(data)).toEqual(new Set());
  });

  it("marks in-progress story from active run", () => {
    const data = baseData({
      status: {
        ...baseData().status,
        isComplete: false,
        completedStories: 0,
        currentStory: {
          id: "US-002",
          title: "WIP",
          passes: false,
          status: "ready",
        },
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
      userStories: [
        {
          id: "US-001",
          title: "Done",
          passes: true,
          status: "ready",
        },
        {
          id: "US-002",
          title: "WIP",
          passes: false,
          status: "ready",
        },
      ],
      loopRunner: { running: false, stopRequested: false, state: null },
    });
    expect(resolveRunningStoryIds(data)).toEqual(new Set(["US-002"]));
  });
});

describe("isLoopProcessRunning", () => {
  it("detects loop runner process", () => {
    expect(isLoopProcessRunning(baseData())).toBe(true);
  });
});

import type { LoopRun, ProjectStatus, UserStory } from "../../types";

export type WorkspaceStatusLoopRunner = {
  running: boolean;
  stopRequested: boolean;
};

export type WorkspaceStatusView =
  | {
      kind: "parallel";
      items: { workerId?: string; storyId: string; title: string }[];
      stopRequested: boolean;
    }
  | {
      kind: "running";
      storyId: string;
      title: string;
      iteration?: number;
      tool?: string;
      workerId?: string;
      stopRequested: boolean;
    }
  | { kind: "runner-only"; stopRequested: boolean }
  | { kind: "complete" }
  | { kind: "ready"; nextId: string; nextTitle: string }
  | { kind: "idle" };

function resolveStory(
  id: string,
  userStories: UserStory[],
  currentStory: ProjectStatus["currentStory"]
): UserStory {
  return (
    userStories.find((s) => s.id === id) ??
    (currentStory?.id === id
      ? currentStory
      : ({ id, title: id } as UserStory))
  );
}

/** 根据 status 与 loopRunner 解析工作区底部状态栏展示模式 */
export function resolveWorkspaceStatusView(
  status: ProjectStatus,
  userStories: UserStory[],
  loopRunner?: WorkspaceStatusLoopRunner
): WorkspaceStatusView {
  const executingRuns =
    status.activeRuns && status.activeRuns.length > 0
      ? status.activeRuns
      : status.activeRun?.status === "running"
        ? [status.activeRun]
        : [];
  const executingRunItems = executingRuns
    .map((run) => {
      const id = run.storyId;
      if (!id) return null;
      return {
        run,
        story: resolveStory(id, userStories, status.currentStory),
      };
    })
    .filter(Boolean) as { run: LoopRun; story: UserStory }[];

  const isRunning =
    status.activeRun?.status === "running" || loopRunner?.running === true;
  const executing =
    status.currentStory ?? executingRunItems[0]?.story ?? null;
  const stopRequested = loopRunner?.stopRequested === true;

  if (isRunning && executingRunItems.length > 1) {
    return {
      kind: "parallel",
      stopRequested,
      items: executingRunItems.map(({ run, story }) => ({
        workerId: run.workerId,
        storyId: story.id,
        title: story.title,
      })),
    };
  }

  if (isRunning && executing) {
    const run = executingRunItems[0]?.run;
    return {
      kind: "running",
      storyId: executing.id,
      title: executing.title,
      iteration: run?.iteration,
      tool: run?.tool,
      workerId: run?.workerId,
      stopRequested,
    };
  }

  if (isRunning) {
    return { kind: "runner-only", stopRequested };
  }

  if (status.isComplete) {
    return { kind: "complete" };
  }

  const next = status.nextStory;
  if (next) {
    return { kind: "ready", nextId: next.id, nextTitle: next.title };
  }

  return { kind: "idle" };
}

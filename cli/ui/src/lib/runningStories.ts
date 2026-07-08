import type { DashboardData } from "../types";

/** 外循环进程或 run 记录是否处于活动状态 */
export function isLoopProcessRunning(data: DashboardData): boolean {
  const { status, loopRunner } = data;
  if (loopRunner?.running) return true;
  if (status.activeRun?.status === "running") return true;
  if ((status.activeRuns?.length ?? 0) > 0) return true;
  const lives =
    data.runLiveWorkers && data.runLiveWorkers.length > 0
      ? data.runLiveWorkers
      : data.runLive
        ? [data.runLive]
        : [];
  return lives.some(
    (l) => l.phase === "invoking" || l.phase === "starting"
  );
}

/**
 * 真正应显示「执行中」的 Story ID。
 * 排除已完成 Story，并合并 DB activeRun 与 loopRunner 状态（去重）。
 */
export function resolveRunningStoryIds(data: DashboardData): Set<string> {
  const completed = new Set(
    data.userStories.filter((s) => s.passes).map((s) => s.id)
  );
  const ids = new Set<string>();
  const add = (id?: string | null) => {
    if (!id || completed.has(id)) return;
    ids.add(id);
  };

  const { status, loopRunner } = data;

  for (const run of status.activeRuns ?? []) {
    if (run.status === "running") add(run.storyId);
  }
  if (status.activeRun?.status === "running") add(status.activeRun.storyId);

  if (loopRunner?.running) {
    for (const w of loopRunner.workers ?? []) add(w.currentStoryId);
    add(loopRunner.state?.currentStoryId);
  }

  const lives =
    data.runLiveWorkers && data.runLiveWorkers.length > 0
      ? data.runLiveWorkers
      : data.runLive
        ? [data.runLive]
        : [];
  for (const live of lives) {
    if (live.phase === "invoking" || live.phase === "starting") {
      add(live.storyId);
    }
  }

  return ids;
}

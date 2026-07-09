import type { ProjectStatus } from "../../types";

export type AppToolbarView = {
  project: string;
  branchName: string;
  completed: number;
  pending: number;
  blocked: number;
  drafts: number;
  total: number;
  progressPct: number;
  showRunning: boolean;
  showComplete: boolean;
};

/** 根据 loop status 聚合结果解析顶栏项目概览展示数据 */
export function resolveAppToolbarView(status: ProjectStatus): AppToolbarView {
  const total = status.totalStories ?? 0;
  const completed = status.completedStories ?? 0;
  const pending = status.pendingStories ?? 0;
  const blocked = status.blockedStories ?? 0;
  const drafts = status.draftStories ?? 0;
  const progressPct = total ? Math.round((completed / total) * 100) : 0;
  const showRunning =
    status.activeRun?.status === "running" ||
    (status.activeRuns?.length ?? 0) > 0;

  return {
    project: status.project,
    branchName: status.branchName,
    completed,
    pending,
    blocked,
    drafts,
    total,
    progressPct,
    showRunning,
    showComplete: status.isComplete === true,
  };
}

import type { DashboardData, LoopRun, ProgressEntry, SelectedMindMapNode, UserStory } from "../../types";
import { sortProgressEntries } from "../progress/sortProgressEntries";

export const RUN_PAGE_SIZE = 20;
export const RUN_STATUS_LABELS: Record<LoopRun["status"], string> = {
  running: "执行中",
  completed: "已完成",
  failed: "失败",
  max_iterations: "达到迭代上限",
};

export interface HistoryFilters {
  keyword: string;
  worker: string;
  status: string;
}

export interface HistoryState extends HistoryFilters {
  page: number;
  selectedKey: string | null;
}

export const emptyHistoryFilters = (): HistoryFilters => ({ keyword: "", worker: "", status: "" });
export const initialHistoryState = (): HistoryState => ({
  ...emptyHistoryFilters(), page: 1, selectedKey: null,
});

export function runKey(run: LoopRun): string {
  return run.id != null ? `id:${run.id}` : JSON.stringify([
    run.startedAt, run.storyId ?? null, run.workerId ?? null, run.iteration, run.tool,
  ]);
}

export function parseRunTime(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const time = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isFinite(time) ? time : null;
}

export function formatRunTime(value: string | null | undefined): string {
  const time = parseRunTime(value);
  return time === null ? "-" : new Date(time).toLocaleString("zh-CN", { hour12: false });
}

export function runDurationMs(run: LoopRun, now: number): number | null {
  const start = parseRunTime(run.startedAt);
  const end = run.status === "running" ? now : parseRunTime(run.endedAt);
  if (start === null || end === null || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

export function formatRunDuration(duration: number | null): string {
  if (duration === null || !Number.isFinite(duration) || duration < 0) return "-";
  const seconds = Math.floor(duration / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m ${seconds % 60}s`
    : minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export function sortRuns(runs: readonly LoopRun[]): LoopRun[] {
  return [...runs].sort((a, b) => {
    const aTime = parseRunTime(a.startedAt);
    const bTime = parseRunTime(b.startedAt);
    if (aTime !== bTime) {
      if (aTime === null) return 1;
      if (bTime === null) return -1;
      return bTime - aTime;
    }
    return (b.id ?? -1) - (a.id ?? -1) || runKey(a).localeCompare(runKey(b));
  });
}

export function filterRuns(runs: readonly LoopRun[], stories: readonly UserStory[], filters: HistoryFilters): LoopRun[] {
  const keyword = filters.keyword.trim().toLowerCase();
  const titles = new Map(stories.map((story) => [story.id, story.title]));
  return runs.filter((run) => {
    const title = run.storyId ? titles.get(run.storyId) ?? "" : "";
    return (!keyword || `${run.storyId ?? ""} ${title}`.toLowerCase().includes(keyword))
      && (!filters.worker || (run.workerId ?? "") === filters.worker)
      && (!filters.status || run.status === filters.status);
  });
}

export function paginateRuns(runs: readonly LoopRun[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(runs.length / RUN_PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const offset = (page - 1) * RUN_PAGE_SIZE;
  return { page, pageCount, items: runs.slice(offset, offset + RUN_PAGE_SIZE), total: runs.length,
    first: runs.length ? offset + 1 : 0, last: Math.min(offset + RUN_PAGE_SIZE, runs.length) };
}

type HistoryData = Pick<DashboardData, "runs" | "userStories" | "archivedStories">;

export function historyPage(data: HistoryData, state: HistoryState) {
  return paginateRuns(sortRuns(filterRuns(data.runs, [...data.userStories, ...data.archivedStories], state)), state.page);
}

export function changeHistoryFilters(state: HistoryState, filters: Partial<HistoryFilters>): HistoryState {
  return { ...state, ...filters, page: 1 };
}

export function reconcileHistory(state: HistoryState, data: HistoryData): HistoryState {
  return {
    ...state,
    page: historyPage(data, state).page,
    selectedKey: data.runs.some((run) => runKey(run) === state.selectedKey) ? state.selectedKey : null,
  };
}

export function loadedRunRange(runs: readonly LoopRun[]) {
  const times = runs.map((run) => parseRunTime(run.startedAt)).filter((time): time is number => time !== null);
  return { total: runs.length, oldest: times.length ? new Date(Math.min(...times)).toISOString() : null,
    newest: times.length ? new Date(Math.max(...times)).toISOString() : null, unknownTimes: runs.length - times.length };
}

export type RunStoryTarget =
  | { kind: "active"; story: UserStory; node: SelectedMindMapNode }
  | { kind: "archived"; story: UserStory }
  | { kind: "missing"; storyId: string | null; reason: string };

export function resolveRunStory(run: LoopRun, data: Pick<DashboardData, "userStories" | "archivedStories">): RunStoryTarget {
  const story = data.userStories.find((item) => item.id === run.storyId);
  if (story && !story.archivedAt) {
    return { kind: "active", story, node: { id: story.id, kind: story.removalRequestedAt ? "pending_removal"
      : story.passes ? "done" : story.status === "draft" ? "draft" : "story" } };
  }
  const archived = data.archivedStories.find((item) => item.id === run.storyId) ?? story;
  if (archived) return { kind: "archived", story: archived };
  return { kind: "missing", storyId: run.storyId ?? null,
    reason: run.storyId ? "Story 已删除或不在当前项目数据中，无法定位。" : "该运行未关联 Story，无法定位。" };
}

// Progress has no run/worker key; associate by Story only, never infer an exact run from dates.
export function relatedRunProgress(run: LoopRun, entries: ProgressEntry[]): ProgressEntry[] {
  return run.storyId ? sortProgressEntries(entries.filter((entry) => entry.storyId === run.storyId)) : [];
}

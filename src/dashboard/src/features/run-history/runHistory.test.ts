import { describe, expect, it } from "vitest";
import type { LoopRun, ProgressEntry, UserStory } from "../../types";
import {
  changeHistoryFilters, emptyHistoryFilters, filterRuns, formatRunDuration, formatRunTime,
  historyPage, initialHistoryState, loadedRunRange, paginateRuns, parseRunTime,
  reconcileHistory, relatedRunProgress, resolveRunStory, runDurationMs, runKey, sortRuns,
} from "./runHistory";

const start = "2026-10-10T10:00:00.000Z";
const now = Date.parse("2026-10-10T10:01:02.000Z");
const run = (overrides: Partial<LoopRun> = {}): LoopRun => ({
  id: 1, iteration: 1, tool: "codex", storyId: "US-005", workerId: "w0",
  status: "failed", message: "failure", startedAt: start, endedAt: "2026-10-10T10:01:00.000Z", ...overrides,
});
const story = (overrides: Partial<UserStory> = {}): UserStory => ({
  id: "US-005", title: "Dashboard History", description: "", acceptanceCriteria: [], notes: "",
  parentId: null, milestoneId: null, dependsOn: [], workType: "implementation",
  priority: 0, passes: false, status: "ready", sortOrder: 0, removalRequestedAt: null, archivedAt: null, ...overrides,
});

describe("loaded run history filters and ordering", () => {
  const stories = [story(), story({ id: "US-006", title: "归档任务", archivedAt: start })];
  const runs = [
    run(), run({ id: 2, workerId: "w1", status: "completed" }),
    run({ id: 3, storyId: "US-006" }), run({ id: 4, storyId: "US-deleted" }),
    run({ id: 5, storyId: null, workerId: null }),
  ];

  it("combines case-insensitive ID/title, exact Worker and status filters", () => {
    expect(filterRuns(runs, stories, { keyword: " DASHboard ", worker: "w0", status: "failed" }).map(runKey)).toEqual(["id:1"]);
    expect(filterRuns(runs, stories, { ...emptyHistoryFilters(), keyword: "us-005" })).toHaveLength(2);
    expect(filterRuns(runs, stories, { ...emptyHistoryFilters(), keyword: "归档" }).map(runKey)).toEqual(["id:3"]);
    expect(filterRuns(runs, stories, { ...emptyHistoryFilters(), keyword: "US-deleted" }).map(runKey)).toEqual(["id:4"]);
    expect(filterRuns(runs, stories, { ...emptyHistoryFilters(), worker: "w" })).toEqual([]);
    expect(filterRuns(runs, stories, { ...emptyHistoryFilters(), keyword: "no match" })).toEqual([]);
    expect(filterRuns(runs, stories, emptyHistoryFilters())).toEqual(runs);
  });

  it("orders descending by actual start time, then numeric ID, with invalid times last without mutating input", () => {
    const input = [
      run({ id: 2 }), run({ id: 10 }), run({ id: 99, startedAt: "invalid" }),
      run({ id: 3, startedAt: "2026-10-10T12:00:00+01:00" }),
      run({ id: 100, startedAt: "" }), run({ id: 7, startedAt: "2026-10-10 10:00:00" }),
    ];
    expect(sortRuns(input).map((item) => item.id)).toEqual([3, 10, 7, 2, 100, 99]);
    expect(sortRuns([...input].reverse())).toEqual(sortRuns(input));
    expect(input.map((item) => item.id)).toEqual([2, 10, 99, 3, 100, 7]);
  });

  it("reports loaded range independently of filters, including unknown times and empty input", () => {
    expect(loadedRunRange([run(), run({ startedAt: "invalid" }), run({ startedAt: "2026-10-10T11:00:00Z" })]))
      .toEqual({ total: 3, oldest: start, newest: "2026-10-10T11:00:00.000Z", unknownTimes: 1 });
    expect(loadedRunRange([])).toEqual({ total: 0, oldest: null, newest: null, unknownTimes: 0 });
    expect(loadedRunRange([run({ startedAt: "" })]).unknownTimes).toBe(1);
  });
});

describe("history pagination and refresh reconciliation", () => {
  const runs = Array.from({ length: 45 }, (_, index) => run({ id: index + 1 }));
  const data = { runs, userStories: [story()], archivedStories: [] };

  it("uses 20 records per page and clamps bounds, including empty and malformed pages", () => {
    expect(paginateRuns(runs, 1)).toMatchObject({ page: 1, pageCount: 3, first: 1, last: 20 });
    expect(paginateRuns(runs, 2).items).toEqual(runs.slice(20, 40));
    expect(paginateRuns(runs, 99)).toMatchObject({ page: 3, first: 41, last: 45 });
    for (const page of [0, -1, NaN, Infinity]) expect(paginateRuns(runs, page).page).toBe(1);
    expect(paginateRuns([], 3)).toEqual({ page: 1, pageCount: 1, items: [], total: 0, first: 0, last: 0 });
  });

  it("resets page for every changed filter and clearing while retaining selection", () => {
    const state = { ...initialHistoryState(), page: 3, selectedKey: "id:1" };
    for (const filters of [{ keyword: "test" }, { worker: "w1" }, { status: "failed" }, emptyHistoryFilters()]) {
      expect(changeHistoryFilters(state, filters)).toMatchObject({ page: 1, selectedKey: "id:1", ...filters });
    }
  });

  it("sorts before slicing and keeps valid page, filters and selected identity across reordered snapshots", () => {
    const state = { ...initialHistoryState(), keyword: "history", worker: "w0", status: "failed", page: 2, selectedKey: "id:3" };
    expect(historyPage(data, state).items.map((item) => item.id)).toEqual(Array.from({ length: 20 }, (_, index) => 25 - index));
    expect(reconcileHistory(state, { ...data, runs: [...runs].reverse() })).toEqual(state);
    const updated = runs.map((item) => item.id === 3 ? { ...item, message: "new full message", status: "completed" as const } : item);
    expect(reconcileHistory(state, { ...data, runs: updated }).selectedKey).toBe("id:3");
    expect(updated.find((item) => runKey(item) === state.selectedKey)?.message).toBe("new full message");
  });

  it("clamps a shrinking page and clears only a removed selection, including after filters no longer match", () => {
    const state = { ...initialHistoryState(), page: 3, selectedKey: "id:3" };
    const refreshed = reconcileHistory(state, { ...data, runs: runs.slice(0, 21) });
    expect(refreshed).toMatchObject({ page: 2, selectedKey: "id:3" });
    expect(reconcileHistory(refreshed, data).page).toBe(2);
    expect(reconcileHistory(state, { ...data, runs: [] })).toMatchObject({ page: 1, selectedKey: null });
    expect(reconcileHistory({ ...state, keyword: "nothing" }, data)).toMatchObject({ page: 1, selectedKey: "id:3", keyword: "nothing" });
  });

  it("keeps legacy missing-ID identities independent of position/status/message", () => {
    const legacy = run({ id: undefined });
    expect(runKey(legacy)).toBe(runKey({ ...legacy, status: "completed", message: "updated" }));
    expect(runKey(run({ id: 0 }))).toBe("id:0");
  });
});

describe("run time display", () => {
  it("updates running duration at refresh time and freezes terminal durations", () => {
    expect(runDurationMs(run(), now)).toBe(60_000);
    expect(runDurationMs(run(), now + 15_000)).toBe(60_000);
    expect(runDurationMs(run({ status: "running", endedAt: null }), now)).toBe(62_000);
    expect(runDurationMs(run({ status: "running" }), now + 15_000)).toBe(77_000);
    expect(runDurationMs(run({ endedAt: start }), now)).toBe(0);
    expect(formatRunDuration(3_661_000)).toBe("1h 1m 1s");
    expect(formatRunDuration(62_000)).toBe("1m 2s");
    expect(formatRunDuration(0)).toBe("0s");
  });

  it("does not show NaN, negative duration or invalid times", () => {
    for (const value of ["", "invalid", "2026-99-99T00:00:00Z", null, undefined]) {
      expect(parseRunTime(value)).toBeNull();
      expect(formatRunTime(value)).toBe("-");
    }
    for (const item of [
      run({ startedAt: "" }), run({ startedAt: "invalid" }), run({ endedAt: null }),
      run({ endedAt: "invalid" }), run({ endedAt: "2026-10-09T00:00:00Z" }),
      run({ status: "running", startedAt: "2026-10-11T00:00:00Z" }),
    ]) expect(runDurationMs(item, now)).toBeNull();
    expect(runDurationMs(run({ status: "running" }), NaN)).toBeNull();
    for (const value of [null, -1, NaN, Infinity]) expect(formatRunDuration(value)).toBe("-");
    expect(parseRunTime("2026-10-10 10:00:00")).toBe(Date.parse(start));
  });
});

describe("story navigation and loaded progress association", () => {
  it("resolves active, done, draft and removal-requested Stories to existing map nodes", () => {
    for (const [overrides, kind] of [
      [{}, "story"], [{ passes: true }, "done"], [{ status: "draft" }, "draft"],
      [{ removalRequestedAt: start }, "pending_removal"],
    ] as const) {
      expect(resolveRunStory(run(), { userStories: [story(overrides)], archivedStories: [] }))
        .toMatchObject({ kind: "active", node: { id: "US-005", kind } });
    }
  });

  it("resolves archives to read-only data, never a map target; missing IDs remain non-locatable", () => {
    const archived = story({ archivedAt: start });
    expect(resolveRunStory(run(), { userStories: [], archivedStories: [archived] }))
      .toEqual({ kind: "archived", story: archived });
    expect(resolveRunStory(run(), { userStories: [archived], archivedStories: [] }))
      .toEqual({ kind: "archived", story: archived });
    expect(resolveRunStory(run(), { userStories: [], archivedStories: [] }))
      .toMatchObject({ kind: "missing", storyId: "US-005", reason: expect.stringContaining("无法定位") });
    expect(resolveRunStory(run({ storyId: null }), { userStories: [], archivedStories: [] }))
      .toMatchObject({ kind: "missing", storyId: null });
  });

  it("associates only exact Story IDs, not Worker, date or unassigned project-wide entries", () => {
    const entries: ProgressEntry[] = [
      { id: 1, storyId: "US-005", entryDate: "2026-10-01", summary: "Previous run", learnings: [] },
      { id: 2, storyId: null, entryDate: "2026-10-10", summary: "Project progress", learnings: [] },
      { id: 3, storyId: "US-050", entryDate: "2026-10-10", summary: "Other story", learnings: [] },
      { id: 4, storyId: "US-005", entryDate: "2026-10-10", summary: "Latest progress", learnings: ["Lesson"] },
    ];
    expect(relatedRunProgress(run(), entries).map((entry) => entry.id)).toEqual([4, 1]);
    expect(relatedRunProgress(run({ workerId: "w9" }), entries)).toEqual(relatedRunProgress(run(), entries));
    expect(relatedRunProgress(run({ storyId: null }), entries)).toEqual([]);
    expect(relatedRunProgress(run(), [])).toEqual([]);
    expect(entries.map((entry) => entry.id)).toEqual([1, 2, 3, 4]);
  });
});

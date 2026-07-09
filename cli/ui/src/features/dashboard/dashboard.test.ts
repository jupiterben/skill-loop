import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearDashboardState,
  getDashboardStatus,
  isPidAlive,
  readDashboardState,
  startDashboardBackground,
  stopDashboard,
  writeDashboardState,
} from "../../../../src/dashboard-process.js";
import { getDashboardStateFile } from "../../../../src/paths.js";

describe("Dashboard 服务管理命令", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createProjectRoot() {
    const root = mkdtempSync(join(tmpdir(), "loop-dashboard-"));
    roots.push(root);
    return root;
  }

  it("readDashboardState 无 dashboard.json 时返回 null", () => {
    const root = createProjectRoot();
    expect(readDashboardState(root)).toBeNull();
    expect(existsSync(getDashboardStateFile(root))).toBe(false);
  });

  it("writeDashboardState 持久化 pid/port/url/startedAt", () => {
    const root = createProjectRoot();
    const state = {
      pid: 12345,
      port: 3460,
      url: "http://localhost:3460",
      startedAt: "2026-07-09T07:00:00.000Z",
    };
    writeDashboardState(root, state);
    expect(readDashboardState(root)).toEqual(state);
  });

  it("getDashboardStatus 未运行时返回 running:false", () => {
    const root = createProjectRoot();
    expect(getDashboardStatus(root)).toEqual({
      running: false,
      pid: null,
      port: null,
      url: null,
      startedAt: null,
    });
  });

  it("getDashboardStatus 检测到存活进程时返回运行信息", () => {
    const root = createProjectRoot();
    writeDashboardState(root, {
      pid: process.pid,
      port: 3460,
      url: "http://localhost:3460",
      startedAt: "2026-07-09T07:00:00.000Z",
    });

    expect(getDashboardStatus(root)).toEqual({
      running: true,
      pid: process.pid,
      port: 3460,
      url: "http://localhost:3460",
      startedAt: "2026-07-09T07:00:00.000Z",
    });
  });

  it("getDashboardStatus 清理已结束进程的状态文件", () => {
    const root = createProjectRoot();
    writeDashboardState(root, {
      pid: 999999999,
      port: 3460,
      url: "http://localhost:3460",
      startedAt: "2026-07-09T07:00:00.000Z",
    });

    expect(isPidAlive(999999999)).toBe(false);
    expect(getDashboardStatus(root).running).toBe(false);
    expect(readDashboardState(root)).toBeNull();
  });

  it("stopDashboard 未运行时返回清晰提示", async () => {
    const root = createProjectRoot();
    await expect(stopDashboard(root)).resolves.toEqual({
      stopped: false,
      pid: null,
      message: "Dashboard 未运行",
    });
  });

  it("stopDashboard 对已结束进程清理状态并提示", async () => {
    const root = createProjectRoot();
    writeDashboardState(root, {
      pid: 999999999,
      port: 3460,
      url: "http://localhost:3460",
      startedAt: "2026-07-09T07:00:00.000Z",
    });

    await expect(stopDashboard(root)).resolves.toEqual({
      stopped: false,
      pid: 999999999,
      message: "Dashboard 进程已结束（已清理状态）",
    });
    expect(readDashboardState(root)).toBeNull();
  });

  it("startDashboardBackground 检测到已在运行时不重复启动", async () => {
    const root = createProjectRoot();
    writeDashboardState(root, {
      pid: process.pid,
      port: 3999,
      url: "http://localhost:3999",
      startedAt: "2026-07-09T07:00:00.000Z",
    });

    await expect(
      startDashboardBackground(root, { port: 3460, open: true })
    ).resolves.toEqual({
      started: false,
      url: "http://localhost:3999",
      pid: process.pid,
      message: "Dashboard 已在运行",
    });
  });

  it("clearDashboardState 移除 dashboard.json", () => {
    const root = createProjectRoot();
    writeDashboardState(root, {
      pid: 1,
      port: 3460,
      url: "http://localhost:3460",
      startedAt: "2026-07-09T07:00:00.000Z",
    });
    clearDashboardState(root);
    expect(readDashboardState(root)).toBeNull();
  });
});

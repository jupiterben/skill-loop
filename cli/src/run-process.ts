import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { getLoopRunStateFile } from "./paths.js";

export type LoopRunState = {
  pid: number;
  tool: string;
  startedAt: string;
  mode: "limited" | "until-stop";
  maxIterations?: number;
  stopRequested?: boolean;
  currentStoryId?: string | null;
  iteration?: number;
};

export function readLoopRunState(projectRoot: string): LoopRunState | null {
  const path = getLoopRunStateFile(projectRoot);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LoopRunState;
  } catch {
    return null;
  }
}

export function writeLoopRunState(
  projectRoot: string,
  state: LoopRunState
): void {
  writeFileSync(
    getLoopRunStateFile(projectRoot),
    JSON.stringify(state, null, 2) + "\n",
    "utf8"
  );
}

export function clearLoopRunState(projectRoot: string): void {
  const path = getLoopRunStateFile(projectRoot);
  if (existsSync(path)) unlinkSync(path);
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isLoopRunStopRequested(projectRoot: string): boolean {
  return readLoopRunState(projectRoot)?.stopRequested === true;
}

export function requestLoopRunStop(projectRoot: string): {
  ok: boolean;
  pid?: number;
  message: string;
} {
  const state = readLoopRunState(projectRoot);
  if (!state) {
    return { ok: false, message: "外循环未在运行" };
  }

  writeLoopRunState(projectRoot, { ...state, stopRequested: true });

  if (!isPidAlive(state.pid)) {
    clearLoopRunState(projectRoot);
    return { ok: true, message: "外循环进程已结束，已清理状态" };
  }

  return {
    ok: true,
    pid: state.pid,
    message: "已发送停止请求，当前轮结束后退出",
  };
}

export function getLoopRunStatus(projectRoot: string): {
  running: boolean;
  stopRequested: boolean;
  state: LoopRunState | null;
} {
  const state = readLoopRunState(projectRoot);
  if (!state) {
    return { running: false, stopRequested: false, state: null };
  }

  if (!isPidAlive(state.pid)) {
    clearLoopRunState(projectRoot);
    return { running: false, stopRequested: false, state: null };
  }

  return {
    running: true,
    stopRequested: state.stopRequested === true,
    state,
  };
}

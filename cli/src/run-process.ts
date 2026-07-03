import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  getLoopCoordinatorStateFile,
  getLoopRunStateFile,
  getWorkerRunStateFile,
  getWorkerRunsDir,
} from "./paths.js";

export type LoopRunState = {
  pid: number;
  tool: string;
  startedAt: string;
  mode: "limited" | "until-stop";
  maxIterations?: number;
  stopRequested?: boolean;
  currentStoryId?: string | null;
  iteration?: number;
  workerId?: string;
};

export type LoopCoordinatorState = {
  pid: number;
  tool: string;
  startedAt: string;
  mode: "limited" | "until-stop";
  maxIterations?: number;
  stopRequested?: boolean;
  workers: number;
  workerIds: string[];
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

export function readCoordinatorState(
  projectRoot: string
): LoopCoordinatorState | null {
  const path = getLoopCoordinatorStateFile(projectRoot);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LoopCoordinatorState;
  } catch {
    return null;
  }
}

export function writeCoordinatorState(
  projectRoot: string,
  state: LoopCoordinatorState
): void {
  writeFileSync(
    getLoopCoordinatorStateFile(projectRoot),
    JSON.stringify(state, null, 2) + "\n",
    "utf8"
  );
}

export function clearCoordinatorState(projectRoot: string): void {
  const path = getLoopCoordinatorStateFile(projectRoot);
  if (existsSync(path)) unlinkSync(path);
}

export function readWorkerRunState(
  projectRoot: string,
  workerId: string
): LoopRunState | null {
  const path = getWorkerRunStateFile(projectRoot, workerId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LoopRunState;
  } catch {
    return null;
  }
}

export function writeWorkerRunState(
  projectRoot: string,
  workerId: string,
  state: LoopRunState
): void {
  writeFileSync(
    getWorkerRunStateFile(projectRoot, workerId),
    JSON.stringify({ ...state, workerId }, null, 2) + "\n",
    "utf8"
  );
}

export function clearWorkerRunState(
  projectRoot: string,
  workerId: string
): void {
  const path = getWorkerRunStateFile(projectRoot, workerId);
  if (existsSync(path)) unlinkSync(path);
}

export function clearAllWorkerRunStates(projectRoot: string): void {
  const dir = getWorkerRunsDir(projectRoot);
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    if (file.endsWith(".json") && !file.endsWith("-live.json")) {
      unlinkSync(`${dir}/${file}`);
    }
  }
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
  const coord = readCoordinatorState(projectRoot);
  if (coord?.stopRequested) return true;
  return readLoopRunState(projectRoot)?.stopRequested === true;
}

export function requestLoopRunStop(
  projectRoot: string,
  workerId?: string
): {
  ok: boolean;
  pid?: number;
  message: string;
} {
  if (workerId) {
    const worker = readWorkerRunState(projectRoot, workerId);
    if (!worker) {
      return { ok: false, message: `worker ${workerId} 未在运行` };
    }
    writeWorkerRunState(projectRoot, workerId, {
      ...worker,
      stopRequested: true,
    });
    return {
      ok: true,
      pid: worker.pid,
      message: `已请求停止 worker ${workerId}`,
    };
  }

  const coord = readCoordinatorState(projectRoot);
  if (coord) {
    writeCoordinatorState(projectRoot, { ...coord, stopRequested: true });
    if (!isPidAlive(coord.pid)) {
      clearCoordinatorState(projectRoot);
      clearAllWorkerRunStates(projectRoot);
      return { ok: true, message: "外循环进程已结束，已清理状态" };
    }
    return {
      ok: true,
      pid: coord.pid,
      message: "已发送停止请求，当前轮结束后退出",
    };
  }

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
  coordinator: LoopCoordinatorState | null;
  workers: LoopRunState[];
} {
  const coordinator = readCoordinatorState(projectRoot);
  if (coordinator) {
    if (!isPidAlive(coordinator.pid)) {
      clearCoordinatorState(projectRoot);
      clearAllWorkerRunStates(projectRoot);
      return {
        running: false,
        stopRequested: false,
        state: null,
        coordinator: null,
        workers: [],
      };
    }
    const workers = coordinator.workerIds
      .map((id) => readWorkerRunState(projectRoot, id))
      .filter((s): s is LoopRunState => s != null);
    return {
      running: true,
      stopRequested: coordinator.stopRequested === true,
      state: workers[0] ?? null,
      coordinator,
      workers,
    };
  }

  const state = readLoopRunState(projectRoot);
  if (!state) {
    return {
      running: false,
      stopRequested: false,
      state: null,
      coordinator: null,
      workers: [],
    };
  }

  if (!isPidAlive(state.pid)) {
    clearLoopRunState(projectRoot);
    return {
      running: false,
      stopRequested: false,
      state: null,
      coordinator: null,
      workers: [],
    };
  }

  return {
    running: true,
    stopRequested: state.stopRequested === true,
    state,
    coordinator: null,
    workers: [state],
  };
}

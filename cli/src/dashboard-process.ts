import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolveDistEntry, spawnDetachedNodeProcess } from "./runtime-entry.js";
import { getDashboardStateFile } from "./paths.js";

export type DashboardState = {
  pid: number;
  port: number;
  url: string;
  startedAt: string;
};

export function readDashboardState(
  projectRoot: string
): DashboardState | null {
  const path = getDashboardStateFile(projectRoot);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DashboardState;
  } catch {
    return null;
  }
}

export function writeDashboardState(
  projectRoot: string,
  state: DashboardState
): void {
  writeFileSync(
    getDashboardStateFile(projectRoot),
    JSON.stringify(state, null, 2) + "\n",
    "utf8"
  );
}

export function clearDashboardState(projectRoot: string): void {
  const path = getDashboardStateFile(projectRoot);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDashboardState(
  projectRoot: string,
  timeoutMs = 8000
): Promise<DashboardState | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = readDashboardState(projectRoot);
    if (state && isPidAlive(state.pid)) return state;
    await sleep(100);
  }
  return readDashboardState(projectRoot);
}

export async function startDashboardBackground(
  projectRoot: string,
  options?: { port?: number; open?: boolean }
): Promise<{
  started: boolean;
  url: string;
  pid: number | null;
  message?: string;
}> {
  const port = options?.port ?? Number(process.env.LOOP_DASHBOARD_PORT ?? 3460);
  const url = `http://localhost:${port}`;

  const existing = readDashboardState(projectRoot);
  if (existing && isPidAlive(existing.pid)) {
    return {
      started: false,
      url: existing.url,
      pid: existing.pid,
      message: "Dashboard 已在运行",
    };
  }
  if (existing) clearDashboardState(projectRoot);

  const entry = resolveDistEntry("dashboard");
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    LOOP_PROJECT_ROOT: projectRoot,
    LOOP_DASHBOARD_PORT: String(port),
    LOOP_DASHBOARD_OPEN: options?.open !== false ? "1" : "0",
    LOOP_DASHBOARD_QUIET: "1",
  };

  await spawnDetachedNodeProcess(entry, [], childEnv, "loop-dashboard");

  const state = await waitForDashboardState(projectRoot, 15_000);
  if (state) {
    return { started: true, url: state.url, pid: state.pid };
  }

  throw new Error(`Dashboard 启动失败，请检查端口 ${port} 是否被占用`);
}

export async function stopDashboard(projectRoot: string): Promise<{
  stopped: boolean;
  pid: number | null;
  message: string;
}> {
  const state = readDashboardState(projectRoot);
  if (!state) {
    return { stopped: false, pid: null, message: "Dashboard 未运行" };
  }

  if (!isPidAlive(state.pid)) {
    clearDashboardState(projectRoot);
    return {
      stopped: false,
      pid: state.pid,
      message: "Dashboard 进程已结束（已清理状态）",
    };
  }

  try {
    process.kill(state.pid, "SIGTERM");
  } catch (err) {
    clearDashboardState(projectRoot);
    return {
      stopped: false,
      pid: state.pid,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!isPidAlive(state.pid)) {
      clearDashboardState(projectRoot);
      return {
        stopped: true,
        pid: state.pid,
        message: "Dashboard 已关闭",
      };
    }
    await sleep(100);
  }

  try {
    process.kill(state.pid, "SIGKILL");
  } catch {
    /* ignore */
  }
  clearDashboardState(projectRoot);
  return {
    stopped: true,
    pid: state.pid,
    message: "Dashboard 已强制关闭",
  };
}

export function getDashboardStatus(projectRoot: string): {
  running: boolean;
  pid: number | null;
  port: number | null;
  url: string | null;
  startedAt: string | null;
} {
  const state = readDashboardState(projectRoot);
  if (!state) {
    return {
      running: false,
      pid: null,
      port: null,
      url: null,
      startedAt: null,
    };
  }
  const running = isPidAlive(state.pid);
  if (!running) clearDashboardState(projectRoot);
  return {
    running,
    pid: running ? state.pid : null,
    port: running ? state.port : null,
    url: running ? state.url : null,
    startedAt: running ? state.startedAt : null,
  };
}

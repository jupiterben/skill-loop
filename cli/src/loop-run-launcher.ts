import { resolveDistEntry, spawnDetachedNodeProcess } from "./runtime-entry.js";
import {
  getLoopRunStatus,
  isPidAlive,
  readLoopRunState,
} from "./run-process.js";

export type StartLoopRunOptions = {
  tool?: string;
  untilStop?: boolean;
  maxIterations?: number;
  workers?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForLoopRunStart(
  projectRoot: string,
  timeoutMs = 12_000
): Promise<ReturnType<typeof getLoopRunStatus>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = getLoopRunStatus(projectRoot);
    if (status.running) return status;
    await sleep(120);
  }
  const state = readLoopRunState(projectRoot);
  if (state && isPidAlive(state.pid)) {
    return getLoopRunStatus(projectRoot);
  }
  return getLoopRunStatus(projectRoot);
}

export async function startLoopRunBackground(
  projectRoot: string,
  options: StartLoopRunOptions = {}
): Promise<{
  ok: boolean;
  message: string;
  status: ReturnType<typeof getLoopRunStatus>;
}> {
  const current = getLoopRunStatus(projectRoot);
  if (current.running) {
    return {
      ok: false,
      message: "外循环已在运行",
      status: current,
    };
  }

  const untilStop = options.untilStop !== false;
  const toolHint =
    options.tool?.trim() || process.env.LOOP_RUN_TOOL?.trim() || undefined;

  const { resolveRunTool } = await import("./loop-run.js");
  const resolvedTool = resolveRunTool(toolHint);

  const workers = Math.max(1, Math.min(8, options.workers ?? 1));
  const cliArgs = ["run"];
  if (untilStop) {
    cliArgs.push("--until-stop");
  } else {
    const max = options.maxIterations ?? 10;
    if (!Number.isFinite(max) || max < 1) {
      throw new Error("maxIterations 须为正整数");
    }
    cliArgs.push(String(max));
  }
  cliArgs.push("--tool", resolvedTool);
  if (workers > 1) {
    cliArgs.push("--workers", String(workers));
  }

  const entry = resolveDistEntry("cli");
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    LOOP_PROJECT_ROOT: projectRoot,
  };

  await spawnDetachedNodeProcess(entry, cliArgs, childEnv, "loop-run");

  const status = await waitForLoopRunStart(projectRoot);
  if (!status.running) {
    throw new Error(
      "外循环启动失败：子进程未就绪。请确认 agent/claude 等工具已安装，或在终端执行 loop run status 查看详情"
    );
  }

  const tool = status.state?.tool ?? status.coordinator?.tool ?? resolvedTool;
  const workerLabel =
    workers > 1 ? `${workers} workers · ` : "";
  return {
    ok: true,
    message: untilStop
      ? `外循环已启动（${workerLabel}${tool}，持续运行）`
      : `外循环已启动（${workerLabel}${tool}）`,
    status,
  };
}

import type { DashboardData } from "../../types";

/** 与 CLI `loop run --tool` 一致的可选工具 */
export const LOOP_RUN_TOOLS = ["agent", "claude", "amp", "cursor"] as const;
export type LoopRunTool = (typeof LOOP_RUN_TOOLS)[number];

export type LoopRunStartInput = {
  tool: LoopRunTool;
  workers: number;
  untilStop: boolean;
  maxIterations?: number;
};

export type LoopRunControlView = {
  running: boolean;
  stopRequested: boolean;
  tool: string;
  workers: number;
  iteration?: number;
};

export function clampWorkers(workers: number): number {
  return Math.max(1, Math.min(8, Math.round(workers) || 1));
}

export function resolveLoopRunControlView(
  loopRunner?: DashboardData["loopRunner"]
): LoopRunControlView {
  const running = loopRunner?.running === true;
  const stopRequested = loopRunner?.stopRequested === true;
  const tool =
    loopRunner?.state?.tool ??
    loopRunner?.coordinator?.tool ??
    loopRunner?.workers?.[0]?.tool ??
    "agent";
  const workers =
    loopRunner?.coordinator?.workers ??
    loopRunner?.workers?.length ??
    1;

  return {
    running,
    stopRequested,
    tool,
    workers,
    iteration: loopRunner?.state?.iteration,
  };
}

/** 构造与 CLI / API 语义一致的启动参数 */
export function buildStartLoopRunPayload(input: LoopRunStartInput): {
  tool: string;
  workers: number;
  untilStop: boolean;
  maxIterations?: number;
} {
  const workers = clampWorkers(input.workers);
  if (!input.untilStop) {
    const maxIterations = Math.max(1, Math.round(input.maxIterations ?? 10) || 10);
    return {
      tool: input.tool,
      workers,
      untilStop: false,
      maxIterations,
    };
  }
  return {
    tool: input.tool,
    workers,
    untilStop: true,
  };
}

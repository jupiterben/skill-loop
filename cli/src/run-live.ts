import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getRunLiveFile, getWorkerRunsDir } from "./paths.js";

export type RunLivePhase = "starting" | "invoking" | "between" | "done";

export type RunLiveState = {
  workerId?: string;
  iteration: number;
  storyId: string | null;
  tool: string;
  phase: RunLivePhase;
  output: string;
  updatedAt: string;
};

const MAX_OUTPUT_CHARS = 120_000;

function livePath(projectRoot: string, workerId?: string): string {
  return getRunLiveFile(projectRoot, workerId);
}

export function readRunLive(
  projectRoot: string,
  workerId?: string
): RunLiveState | null {
  const path = livePath(projectRoot, workerId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RunLiveState;
  } catch {
    return null;
  }
}

export function writeRunLive(
  projectRoot: string,
  state: RunLiveState,
  workerId?: string
): void {
  const id = workerId ?? state.workerId;
  writeFileSync(
    livePath(projectRoot, id),
    JSON.stringify({ ...state, workerId: id }, null, 2) + "\n",
    "utf8"
  );
}

export function clearRunLive(projectRoot: string, workerId?: string): void {
  const path = livePath(projectRoot, workerId);
  if (existsSync(path)) unlinkSync(path);
}

export function clearAllRunLive(projectRoot: string): void {
  clearRunLive(projectRoot);
  const dir = getWorkerRunsDir(projectRoot);
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    if (file.endsWith("-live.json")) {
      unlinkSync(join(dir, file));
    }
  }
}

export function initRunLive(
  projectRoot: string,
  input: {
    iteration: number;
    storyId: string | null;
    tool: string;
    phase?: RunLivePhase;
    workerId?: string;
  }
): void {
  writeRunLive(
    projectRoot,
    {
      workerId: input.workerId,
      iteration: input.iteration,
      storyId: input.storyId,
      tool: input.tool,
      phase: input.phase ?? "starting",
      output: "",
      updatedAt: new Date().toISOString(),
    },
    input.workerId
  );
}

export function appendRunLiveOutput(
  projectRoot: string,
  chunk: string,
  workerId?: string
): void {
  const cur = readRunLive(projectRoot, workerId);
  if (!cur) return;
  let output = cur.output + chunk;
  if (output.length > MAX_OUTPUT_CHARS) {
    output = output.slice(-MAX_OUTPUT_CHARS);
  }
  writeRunLive(
    projectRoot,
    {
      ...cur,
      output,
      phase: "invoking",
      updatedAt: new Date().toISOString(),
    },
    workerId
  );
}

export function patchRunLivePhase(
  projectRoot: string,
  phase: RunLivePhase,
  workerId?: string
): void {
  const cur = readRunLive(projectRoot, workerId);
  if (!cur) return;
  writeRunLive(
    projectRoot,
    {
      ...cur,
      phase,
      updatedAt: new Date().toISOString(),
    },
    workerId
  );
}

export function getRunLiveForDashboard(
  projectRoot: string
): RunLiveState | null {
  return readRunLive(projectRoot);
}

export function getAllRunLiveForDashboard(
  projectRoot: string
): RunLiveState[] {
  const items: RunLiveState[] = [];
  const legacy = readRunLive(projectRoot);
  if (legacy) items.push(legacy);

  const dir = getWorkerRunsDir(projectRoot);
  if (!existsSync(dir)) return items;

  for (const file of readdirSync(dir)) {
    if (!file.endsWith("-live.json")) continue;
    const workerId = file.replace(/-live\.json$/, "");
    const live = readRunLive(projectRoot, workerId);
    if (live && !items.some((x) => x.workerId === workerId)) {
      items.push(live);
    }
  }
  return items;
}

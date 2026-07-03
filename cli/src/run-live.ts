import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { getRunLiveFile } from "./paths.js";

export type RunLivePhase = "starting" | "invoking" | "between" | "done";

export type RunLiveState = {
  iteration: number;
  storyId: string | null;
  tool: string;
  phase: RunLivePhase;
  output: string;
  updatedAt: string;
};

const MAX_OUTPUT_CHARS = 120_000;

export function readRunLive(projectRoot: string): RunLiveState | null {
  const path = getRunLiveFile(projectRoot);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as RunLiveState;
  } catch {
    return null;
  }
}

export function writeRunLive(
  projectRoot: string,
  state: RunLiveState
): void {
  writeFileSync(
    getRunLiveFile(projectRoot),
    JSON.stringify(state, null, 2) + "\n",
    "utf8"
  );
}

export function clearRunLive(projectRoot: string): void {
  const path = getRunLiveFile(projectRoot);
  if (existsSync(path)) unlinkSync(path);
}

export function initRunLive(
  projectRoot: string,
  input: {
    iteration: number;
    storyId: string | null;
    tool: string;
    phase?: RunLivePhase;
  }
): void {
  writeRunLive(projectRoot, {
    iteration: input.iteration,
    storyId: input.storyId,
    tool: input.tool,
    phase: input.phase ?? "starting",
    output: "",
    updatedAt: new Date().toISOString(),
  });
}

export function appendRunLiveOutput(
  projectRoot: string,
  chunk: string
): void {
  const cur = readRunLive(projectRoot);
  if (!cur) return;
  let output = cur.output + chunk;
  if (output.length > MAX_OUTPUT_CHARS) {
    output = output.slice(-MAX_OUTPUT_CHARS);
  }
  writeRunLive(projectRoot, {
    ...cur,
    output,
    phase: "invoking",
    updatedAt: new Date().toISOString(),
  });
}

export function patchRunLivePhase(
  projectRoot: string,
  phase: RunLivePhase
): void {
  const cur = readRunLive(projectRoot);
  if (!cur) return;
  writeRunLive(projectRoot, {
    ...cur,
    phase,
    updatedAt: new Date().toISOString(),
  });
}

export function getRunLiveForDashboard(projectRoot: string): RunLiveState | null {
  return readRunLive(projectRoot);
}

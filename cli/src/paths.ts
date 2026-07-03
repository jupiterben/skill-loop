import { resolveProjectRoot } from "./config.js";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export function getProjectRoot(): string {
  return resolveProjectRoot();
}

export function getStateDir(projectRoot: string): string {
  const custom = process.env.LOOP_STATE_DIR?.trim();
  const dir = custom ?? join(projectRoot, ".loop");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** PRD / 进度文本目录，默认与 `.loop/` 相同 */
export function getSpecDir(projectRoot: string): string {
  const custom = process.env.LOOP_SPEC_DIR?.trim();
  return custom ?? getStateDir(projectRoot);
}

export function getPrdPath(projectRoot: string): string {
  return join(getSpecDir(projectRoot), "prd.json");
}

export function getProgressPath(projectRoot: string): string {
  return join(getSpecDir(projectRoot), "progress.txt");
}

export function getProjectFile(projectRoot: string): string {
  return join(getStateDir(projectRoot), "project.json");
}

export function getMilestonesDir(projectRoot: string): string {
  const dir = join(getStateDir(projectRoot), "milestones");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getFeaturesDir(projectRoot: string): string {
  const dir = join(getStateDir(projectRoot), "features");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getStoriesDir(projectRoot: string): string {
  const dir = join(getStateDir(projectRoot), "stories");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getPatternsFile(projectRoot: string): string {
  return join(getStateDir(projectRoot), "patterns.json");
}

export function getProgressFile(projectRoot: string): string {
  return join(getStateDir(projectRoot), "progress.json");
}

export function getRunsFile(projectRoot: string): string {
  return join(getStateDir(projectRoot), "runs.json");
}

export function getDashboardStateFile(projectRoot: string): string {
  return join(getStateDir(projectRoot), "dashboard.json");
}

export function getLoopRunStateFile(projectRoot: string): string {
  return join(getStateDir(projectRoot), "run.json");
}

export function getLoopCoordinatorStateFile(projectRoot: string): string {
  return join(getStateDir(projectRoot), "run-coordinator.json");
}

export function getWorkerRunsDir(projectRoot: string): string {
  const dir = join(getStateDir(projectRoot), "runs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getWorkerRunStateFile(
  projectRoot: string,
  workerId: string
): string {
  return join(getWorkerRunsDir(projectRoot), `${workerId}.json`);
}

export function getWorktreesDir(projectRoot: string): string {
  const dir = join(getStateDir(projectRoot), "worktrees");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getRunLiveFile(projectRoot: string, workerId?: string): string {
  if (workerId) {
    return join(getWorkerRunsDir(projectRoot), `${workerId}-live.json`);
  }
  return join(getStateDir(projectRoot), "run-live.json");
}

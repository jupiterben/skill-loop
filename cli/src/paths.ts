import { resolveProjectRoot } from "./config.js";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const LEGACY_STATUS_FILES = [
  "runs.json",
  "run.json",
  "run-coordinator.json",
  "run-live.json",
  "dashboard.json",
  ".last-branch",
] as const;

const LEGACY_STATUS_DIRS = ["runs", "worktrees", "archive"] as const;

const migratedRoots = new Set<string>();

export function getProjectRoot(): string {
  return resolveProjectRoot();
}

function resolveStateDir(projectRoot: string): string {
  const custom = process.env.LOOP_STATE_DIR?.trim();
  return custom ?? join(projectRoot, "loop-data");
}

function resolveStatusDir(projectRoot: string): string {
  const custom = process.env.LOOP_STATUS_DIR?.trim();
  return custom ?? join(projectRoot, ".loop-status");
}

function migrateLegacyStatusFiles(projectRoot: string): void {
  if (migratedRoots.has(projectRoot)) return;
  migratedRoots.add(projectRoot);

  const stateDir = resolveStateDir(projectRoot);
  const statusDir = resolveStatusDir(projectRoot);
  if (!existsSync(stateDir)) return;

  for (const name of LEGACY_STATUS_FILES) {
    const src = join(stateDir, name);
    const dest = join(statusDir, name);
    if (existsSync(src) && !existsSync(dest)) {
      try {
        renameSync(src, dest);
      } catch {
        // 保留旧文件，避免迁移失败时丢失状态
      }
    }
  }

  for (const name of LEGACY_STATUS_DIRS) {
    const src = join(stateDir, name);
    const dest = join(statusDir, name);
    if (existsSync(src) && !existsSync(dest)) {
      try {
        renameSync(src, dest);
      } catch {
        // 保留旧目录
      }
    }
  }
}

export function getStateDir(projectRoot: string): string {
  const dir = resolveStateDir(projectRoot);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** 循环执行运行时状态（不进 git） */
export function getStatusDir(projectRoot: string): string {
  const dir = resolveStatusDir(projectRoot);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  migrateLegacyStatusFiles(projectRoot);
  return dir;
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

export function getProjectSpecFile(projectRoot: string): string {
  return join(getStateDir(projectRoot), "project-spec.json");
}

export function getProgressFile(projectRoot: string): string {
  return join(getStateDir(projectRoot), "progress.json");
}

export function getRunsFile(projectRoot: string): string {
  return join(getStatusDir(projectRoot), "runs.json");
}

export function getDashboardStateFile(projectRoot: string): string {
  return join(getStatusDir(projectRoot), "dashboard.json");
}

export function getLoopRunStateFile(projectRoot: string): string {
  return join(getStatusDir(projectRoot), "run.json");
}

export function getLoopCoordinatorStateFile(projectRoot: string): string {
  return join(getStatusDir(projectRoot), "run-coordinator.json");
}

export function getWorkerRunsDir(projectRoot: string): string {
  const dir = join(getStatusDir(projectRoot), "runs");
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
  const dir = join(getStatusDir(projectRoot), "worktrees");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getRunLiveFile(projectRoot: string, workerId?: string): string {
  if (workerId) {
    return join(getWorkerRunsDir(projectRoot), `${workerId}-live.json`);
  }
  return join(getStatusDir(projectRoot), "run-live.json");
}

export function getLastBranchFile(projectRoot: string): string {
  return join(getStatusDir(projectRoot), ".last-branch");
}

export function getRunArchiveDir(projectRoot: string): string {
  return join(getStatusDir(projectRoot), "archive");
}

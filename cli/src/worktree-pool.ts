import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getWorktreesDir } from "./paths.js";

export type WorktreeHandle = {
  workerId: string;
  storyId: string;
  path: string;
  branch: string;
};

function git(
  projectRoot: string,
  args: string[],
  opts: { cwd?: string } = {}
): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("git", args, {
    cwd: opts.cwd ?? projectRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

export function isGitRepo(projectRoot: string): boolean {
  return git(projectRoot, ["rev-parse", "--git-dir"]).ok;
}

function sanitizeBranchPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._/-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function createWorktree(
  projectRoot: string,
  workerId: string,
  storyId: string,
  baseBranch: string
): WorktreeHandle {
  if (!isGitRepo(projectRoot)) {
    throw new Error(
      "并行模式需要 git 仓库。请在项目根初始化 git，或使用 --workers 1（单 worker，无 worktree）"
    );
  }

  const worktreePath = join(getWorktreesDir(projectRoot), workerId);
  const branch = `loop/${sanitizeBranchPart(workerId)}-${sanitizeBranchPart(storyId)}`;

  if (existsSync(worktreePath)) {
    removeWorktree(projectRoot, workerId);
  }

  const baseRef = baseBranch.trim() || "HEAD";
  const add = git(projectRoot, [
    "worktree",
    "add",
    "-B",
    branch,
    worktreePath,
    baseRef,
  ]);
  if (!add.ok) {
    throw new Error(
      `创建 worktree 失败 (${workerId}): ${add.stderr || add.stdout}`
    );
  }

  return { workerId, storyId, path: worktreePath, branch };
}

export function mergeWorktreeBranch(
  projectRoot: string,
  handle: WorktreeHandle,
  baseBranch: string
): void {
  const target = baseBranch.trim() || "HEAD";
  const merge = git(projectRoot, ["merge", "--no-edit", handle.branch]);
  if (!merge.ok) {
    git(projectRoot, ["merge", "--abort"]);
    throw new Error(
      `合并 ${handle.branch} → ${target} 失败: ${merge.stderr || merge.stdout}`
    );
  }
}

export function removeWorktree(
  projectRoot: string,
  workerId: string
): void {
  const worktreePath = join(getWorktreesDir(projectRoot), workerId);
  if (!existsSync(worktreePath)) return;

  const remove = git(projectRoot, ["worktree", "remove", worktreePath, "--force"]);
  if (!remove.ok) {
    try {
      rmSync(worktreePath, { recursive: true, force: true });
      git(projectRoot, ["worktree", "prune"]);
    } catch {
      /* best effort */
    }
  }
}

export function cleanupAllWorktrees(projectRoot: string): void {
  const dir = getWorktreesDir(projectRoot);
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    removeWorktree(projectRoot, entry);
  }
}

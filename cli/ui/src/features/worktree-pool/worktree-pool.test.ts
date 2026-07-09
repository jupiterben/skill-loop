import { execSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import { getWorktreesDir } from "../../../../src/paths.js";
import {
  cleanupAllWorktrees,
  createWorktree,
  isGitRepo,
  removeWorktree,
} from "../../../../src/worktree-pool.js";

describe("Git worktree 隔离执行", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      const root = roots.pop()!;
      try {
        cleanupAllWorktrees(root);
      } catch {
        /* ignore */
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  function git(root: string, args: string) {
    execSync(`git ${args}`, {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    });
  }

  function initGitProjectRoot() {
    const root = mkdtempSync(join(tmpdir(), "loop-worktree-"));
    roots.push(root);
    mkdirSync(join(root, "loop-data"), { recursive: true });
    writeFileSync(
      join(root, "loop-data", "project.json"),
      JSON.stringify({ name: "demo", branchName: "main", description: "" })
    );
    git(root, "init");
    git(root, 'config user.email "test@loop.test"');
    git(root, 'config user.name "loop-test"');
    writeFileSync(join(root, "README.md"), "# test\n");
    git(root, "add .");
    git(root, 'commit -m "init"');
    return root;
  }

  it("多 worker 模式下为每个 worker 创建独立 worktree 与分支", () => {
    const root = initGitProjectRoot();
    const w0 = createWorktree(root, "w0", "US-001", "main");
    const w1 = createWorktree(root, "w1", "US-002", "main");

    expect(w0.path).toBe(join(getWorktreesDir(root), "w0"));
    expect(w1.path).toBe(join(getWorktreesDir(root), "w1"));
    expect(w0.path).not.toBe(w1.path);
    expect(existsSync(w0.path)).toBe(true);
    expect(existsSync(w1.path)).toBe(true);
    expect(w0.branch).toBe("loop/w0-US-001");
    expect(w1.branch).toBe("loop/w1-US-002");
  });

  it("非 git 仓库时 createWorktree 报错并提示使用 --workers 1", () => {
    const root = mkdtempSync(join(tmpdir(), "loop-no-git-"));
    roots.push(root);
    mkdirSync(join(root, "loop-data"), { recursive: true });

    expect(isGitRepo(root)).toBe(false);
    expect(() => createWorktree(root, "w0", "US-001", "main")).toThrow(
      /--workers 1/
    );
  });

  it("worker 结束后 removeWorktree 与 cleanupAllWorktrees 清理隔离目录", () => {
    const root = initGitProjectRoot();
    createWorktree(root, "w0", "US-010", "main");
    createWorktree(root, "w1", "US-011", "main");

    const worktreesDir = getWorktreesDir(root);
    expect(existsSync(join(worktreesDir, "w0"))).toBe(true);
    expect(existsSync(join(worktreesDir, "w1"))).toBe(true);

    removeWorktree(root, "w0");
    expect(existsSync(join(worktreesDir, "w0"))).toBe(false);
    expect(existsSync(join(worktreesDir, "w1"))).toBe(true);

    cleanupAllWorktrees(root);
    expect(existsSync(join(worktreesDir, "w1"))).toBe(false);
  });

  it("隔离 worktree 位于 .loop-status/worktrees，不写入 loop-data", () => {
    const root = initGitProjectRoot();
    const handle = createWorktree(root, "w0", "US-020", "main");

    expect(handle.path.startsWith(join(root, ".loop-status", "worktrees"))).toBe(
      true
    );
    expect(existsSync(join(root, "loop-data", "project.json"))).toBe(true);
    expect(existsSync(join(handle.path, "loop-data", "project.json"))).toBe(true);

    removeWorktree(root, "w0");
  });

  it("LoopStateDb 始终读写主项目根 loop-data，与 agent cwd 无关", () => {
    const root = initGitProjectRoot();
    const db = new LoopStateDb(root);
    db.upsertProject({
      name: "demo",
      branchName: "main",
      description: "主工作区",
    });

    const handle = createWorktree(root, "w0", "US-030", "main");
    const originalCwd = process.cwd();
    try {
      process.chdir(handle.path);
      const dbFromWorktreeCwd = new LoopStateDb(root);
      expect(dbFromWorktreeCwd.getProjectMeta("demo").description).toBe(
        "主工作区"
      );
      dbFromWorktreeCwd.updateProjectMeta("demo", { description: "仍写主目录" });
    } finally {
      process.chdir(originalCwd);
      removeWorktree(root, "w0");
    }

    const dbMain = new LoopStateDb(root);
    expect(dbMain.getProjectMeta("demo").description).toBe("仍写主目录");
    expect(
      JSON.parse(
        readFileSync(join(root, "loop-data", "project.json"), "utf8")
      ).description
    ).toBe("仍写主目录");
  });

  it("并行外循环 buildWorkerEnv 将 LOOP_PROJECT_ROOT 固定为主项目根", () => {
    const source = readFileSync(
      join(import.meta.dirname, "../../../../src/loop-run.ts"),
      "utf8"
    );
    expect(source).toMatch(/LOOP_PROJECT_ROOT:\s*projectRoot/);
    expect(source).toMatch(/if \(useWorktree\) removeWorktree\(projectRoot, workerId\)/);
    expect(source).toMatch(/if \(useWorktree\) cleanupAllWorktrees\(projectRoot\)/);
  });
});

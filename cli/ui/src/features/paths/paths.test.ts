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
import {
  getDashboardStateFile,
  getLoopRunStateFile,
  getRunsFile,
  getStatusDir,
  getWorkerRunStateFile,
} from "../../../../src/paths.js";

describe("paths", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createProjectRoot() {
    const root = mkdtempSync(join(tmpdir(), "loop-paths-"));
    roots.push(root);
    mkdirSync(join(root, "loop-data"), { recursive: true });
    return root;
  }

  it("运行时状态写入 .loop-status", () => {
    const root = createProjectRoot();
    expect(getStatusDir(root)).toBe(join(root, ".loop-status"));
    expect(getRunsFile(root)).toBe(join(root, ".loop-status", "runs.json"));
    expect(getLoopRunStateFile(root)).toBe(join(root, ".loop-status", "run.json"));
    expect(getDashboardStateFile(root)).toBe(
      join(root, ".loop-status", "dashboard.json")
    );
    expect(getWorkerRunStateFile(root, "w0")).toBe(
      join(root, ".loop-status", "runs", "w0.json")
    );
  });

  it("首次访问时从 loop-data 迁移遗留运行时文件", () => {
    const root = createProjectRoot();
    const legacyRun = join(root, "loop-data", "run.json");
    writeFileSync(
      legacyRun,
      JSON.stringify({ pid: 1, tool: "agent" }, null, 2) + "\n",
      "utf8"
    );

    getStatusDir(root);

    expect(existsSync(legacyRun)).toBe(false);
    expect(readFileSync(getLoopRunStateFile(root), "utf8")).toContain('"pid": 1');
  });
});

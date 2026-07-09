import { readFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import { getRunsFile } from "../../../../src/paths.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("外循环迭代历史（runs.json）", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createDb() {
    const root = mkdtempSync(join(tmpdir(), "loop-run-history-"));
    roots.push(root);
    mkdirSync(join(root, "loop-data"), { recursive: true });
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    return { db, root };
  }

  it("startRun/endRun 持久化 iteration、tool、storyId、workerId、status、startedAt、endedAt", () => {
    const { db, root } = createDb();
    const run = db.startRun("demo", 3, "agent", "US-028", "w0");
    expect(run.iteration).toBe(3);
    expect(run.tool).toBe("agent");
    expect(run.storyId).toBe("US-028");
    expect(run.workerId).toBe("w0");
    expect(run.status).toBe("running");
    expect(run.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(run.endedAt).toBeNull();

    const onDisk = JSON.parse(readFileSync(getRunsFile(root), "utf8")) as {
      runs: typeof run[];
    };
    const saved = onDisk.runs.find((r) => r.id === run.id);
    expect(saved).toMatchObject({
      iteration: 3,
      tool: "agent",
      storyId: "US-028",
      workerId: "w0",
      status: "running",
    });
    expect(saved?.startedAt).toBeTruthy();
    expect(saved?.endedAt).toBeNull();

    const ended = db.endRun(run.id!, "completed", "iteration finished");
    expect(ended.status).toBe("completed");
    expect(ended.endedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const final = JSON.parse(readFileSync(getRunsFile(root), "utf8")) as {
      runs: { id: number; status: string; endedAt: string | null }[];
    };
    const closed = final.runs.find((r) => r.id === run.id);
    expect(closed?.status).toBe("completed");
    expect(closed?.endedAt).toBeTruthy();
  });

  it("getRuns 按时间倒序返回最近记录", () => {
    const { db } = createDb();
    db.startRun("demo", 1, "agent", "US-001", "w0");
    const r2 = db.startRun("demo", 2, "agent", "US-002", "w0");
    db.endRun(r2.id!, "completed");

    const runs = db.getRuns("demo", 10);
    expect(runs[0]?.storyId).toBe("US-002");
    expect(runs[1]?.storyId).toBe("US-001");
  });

  it("CLI status 与 Dashboard 共用 db.getRuns / getStatus.activeRun 读取 runs.json", () => {
    const { db, root } = createDb();
    const run = db.startRun("demo", 5, "agent", "US-028", "w1");

    const fromDb = db.getRuns("demo", 20);
    const fromFile = JSON.parse(readFileSync(getRunsFile(root), "utf8")) as {
      runs: { id: number }[];
    };
    expect(fromDb[0]?.id).toBe(run.id);
    expect(fromFile.runs.some((r) => r.id === run.id)).toBe(true);

    const status = db.getStatus("demo");
    expect(status.activeRun?.id).toBe(run.id);
    expect(status.activeRun?.storyId).toBe("US-028");
    expect(status.activeRuns?.[0]?.workerId).toBe("w1");

    // Dashboard GET /api/dashboard 使用 db.getRuns(projectName, 20)
    const dashboardRuns = db.getRuns("demo", 20);
    expect(dashboardRuns).toEqual(fromDb);
  });

  it("RunsPanel 在侧栏展示迭代历史列表", () => {
    const appSrc = readFileSync(join(here, "../../App.tsx"), "utf8");
    expect(appSrc).toContain('import { RunsPanel } from "./components/RunsPanel"');
    expect(appSrc).toContain("<RunsPanel runs={runs} />");

    const panelSrc = readFileSync(
      join(here, "../../components/RunsPanel.tsx"),
      "utf8"
    );
    expect(panelSrc).toContain("外循环迭代");
    expect(panelSrc).toContain("runs-compact");
    expect(panelSrc).toContain("暂无迭代记录");
  });
});

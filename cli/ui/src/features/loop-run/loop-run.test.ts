import { readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import {
  resolveAgentPromptPath,
  resolveRunTool,
  runLoop,
} from "../../../../src/loop-run.js";
import {
  getLoopRunStateFile,
  getRunsFile,
} from "../../../../src/paths.js";
import {
  clearAllWorkerRunStates,
  clearCoordinatorState,
  clearLoopRunState,
  getLoopRunStatus,
  readLoopRunState,
  requestLoopRunStop,
  writeCoordinatorState,
  writeLoopRunState,
  writeWorkerRunState,
} from "../../../../src/run-process.js";

describe("有限轮外循环执行", () => {
  const roots: string[] = [];
  const prevAgentPrompt = process.env.LOOP_AGENT_PROMPT;

  afterEach(() => {
    if (prevAgentPrompt === undefined) {
      delete process.env.LOOP_AGENT_PROMPT;
    } else {
      process.env.LOOP_AGENT_PROMPT = prevAgentPrompt;
    }
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createProjectRoot() {
    const root = mkdtempSync(join(tmpdir(), "loop-run-"));
    roots.push(root);
    mkdirSync(join(root, "loop-data"), { recursive: true });
    return root;
  }

  function createDb(allComplete = false) {
    const root = createProjectRoot();
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    db.addFeature("demo", { title: "F1", description: "" });
    const feature = db.getFeatures("demo")[0]!;
    const story = db.addStory("demo", {
      parentId: feature.id,
      title: "测试 Story",
      description: "",
      acceptanceCriteria: ["AC"],
      status: "ready",
    });
    if (allComplete) {
      db.completeStoryWithProgress("demo", story.id, { summary: "done" });
    }
    return { db, root, story };
  }

  it("resolveAgentPromptPath 优先使用 LOOP_AGENT_PROMPT 环境变量", () => {
    const root = createProjectRoot();
    const custom = join(root, "custom-agent.md");
    writeFileSync(custom, "# custom");
    process.env.LOOP_AGENT_PROMPT = custom;

    expect(resolveAgentPromptPath(root)).toBe(custom);
  });

  it("resolveAgentPromptPath 其次使用 loop-data/AGENT.md", () => {
    const root = createProjectRoot();
    delete process.env.LOOP_AGENT_PROMPT;
    const inProject = join(root, "loop-data", "AGENT.md");
    writeFileSync(inProject, "# project agent");

    expect(resolveAgentPromptPath(root)).toBe(inProject);
  });

  it("resolveAgentPromptPath 回退到内置 templates/AGENT.md", () => {
    const root = createProjectRoot();
    delete process.env.LOOP_AGENT_PROMPT;

    const path = resolveAgentPromptPath(root);
    expect(path).toMatch(/templates[/\\]AGENT\.md$/);
  });

  it("resolveRunTool 将 cursor 映射为 agent（若已安装）", () => {
    const tool = resolveRunTool("cursor");
    expect(["agent", "claude", "amp"]).toContain(tool);
  });

  it("startRun/endRun 写入 runs.json", () => {
    const { db, root } = createDb();
    const run = db.startRun("demo", 1, "agent", "US-001", "w0");
    expect(run.status).toBe("running");
    expect(run.iteration).toBe(1);
    expect(run.tool).toBe("agent");
    expect(run.storyId).toBe("US-001");
    expect(run.workerId).toBe("w0");

    const raw = JSON.parse(readFileSync(getRunsFile(root), "utf8")) as {
      runs: { id: number; status: string }[];
    };
    expect(raw.runs.some((r) => r.id === run.id && r.status === "running")).toBe(
      true
    );

    db.endRun(run.id!, "completed", "iteration finished");
    const ended = JSON.parse(readFileSync(getRunsFile(root), "utf8")) as {
      runs: { id: number; status: string; message: string | null }[];
    };
    const saved = ended.runs.find((r) => r.id === run.id);
    expect(saved?.status).toBe("completed");
    expect(saved?.message).toBe("iteration finished");
  });

  it("writeLoopRunState 持久化有限轮 run.json（含 maxIterations）", () => {
    const root = createProjectRoot();
    writeLoopRunState(root, {
      pid: process.pid,
      tool: "agent",
      startedAt: "2026-07-09T07:00:00.000Z",
      mode: "limited",
      maxIterations: 10,
      stopRequested: false,
      iteration: 1,
      currentStoryId: "US-001",
    });

    const state = readLoopRunState(root);
    expect(state?.mode).toBe("limited");
    expect(state?.maxIterations).toBe(10);
    expect(state?.currentStoryId).toBe("US-001");
    expect(readFileSync(getLoopRunStateFile(root), "utf8")).toContain(
      '"maxIterations": 10'
    );
  });

  it("getLoopRunStatus 检测到存活进程时返回 running", () => {
    const root = createProjectRoot();
    writeLoopRunState(root, {
      pid: process.pid,
      tool: "agent",
      startedAt: "2026-07-09T07:00:00.000Z",
      mode: "limited",
      maxIterations: 5,
      stopRequested: false,
    });

    const status = getLoopRunStatus(root);
    expect(status.running).toBe(true);
    expect(status.state?.tool).toBe("agent");
    expect(status.state?.maxIterations).toBe(5);

    clearLoopRunState(root);
    expect(getLoopRunStatus(root).running).toBe(false);
  });

  it("getNextStory 仅返回 ready 且依赖满足的 Story", () => {
    const { db } = createDb();
    expect(db.getNextStory("demo")?.status).toBe("ready");

    const stories = db.getStories("demo");
    const only = stories[0]!;
    db.updateStory("demo", only.id, { status: "draft" });
    expect(db.getNextStory("demo")).toBeNull();
  });

  it("runLoop 在项目已全部完成时立即退出", async () => {
    const { db, root } = createDb(true);

    const result = await runLoop(db, root, {
      tool: "agent",
      maxIterations: 10,
      projectName: "demo",
    });

    expect(result.completed).toBe(true);
    expect(result.iterations).toBe(0);
    expect(result.maxIterations).toBe(10);
    expect(result.untilStop).toBe(false);
    expect(result.reason).toBe("所有 Story 已完成");
  });
});

describe("持续监听与优雅停止", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createProjectRoot() {
    const root = mkdtempSync(join(tmpdir(), "loop-watch-"));
    roots.push(root);
    mkdirSync(join(root, "loop-data"), { recursive: true });
    return root;
  }

  function createDb() {
    const root = createProjectRoot();
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    db.addFeature("demo", { title: "F1", description: "" });
    const feature = db.getFeatures("demo")[0]!;
    const story = db.addStory("demo", {
      parentId: feature.id,
      title: "测试 Story",
      description: "",
      acceptanceCriteria: ["AC"],
      status: "ready",
    });
    return { db, root, story };
  }

  it("requestLoopRunStop 为 until-stop 外循环设置 stopRequested", () => {
    const root = createProjectRoot();
    writeLoopRunState(root, {
      pid: process.pid,
      tool: "agent",
      startedAt: "2026-07-09T08:00:00.000Z",
      mode: "until-stop",
      stopRequested: false,
      iteration: 3,
    });

    const result = requestLoopRunStop(root);
    expect(result.ok).toBe(true);

    const status = getLoopRunStatus(root);
    expect(status.running).toBe(true);
    expect(status.stopRequested).toBe(true);
    expect(status.state?.mode).toBe("until-stop");
    expect(status.state?.iteration).toBe(3);

    clearLoopRunState(root);
  });

  it("requestLoopRunStop --worker 仅标记指定 worker，协调器 stop 停止整轮外循环", () => {
    const root = createProjectRoot();
    writeCoordinatorState(root, {
      pid: process.pid,
      tool: "agent",
      startedAt: "2026-07-09T08:00:00.000Z",
      mode: "until-stop",
      stopRequested: false,
      workers: 2,
      workerIds: ["w0", "w1"],
    });
    writeWorkerRunState(root, "w0", {
      pid: process.pid,
      tool: "agent",
      startedAt: "2026-07-09T08:00:00.000Z",
      mode: "until-stop",
      stopRequested: false,
      iteration: 2,
      workerId: "w0",
    });
    writeWorkerRunState(root, "w1", {
      pid: process.pid,
      tool: "agent",
      startedAt: "2026-07-09T08:00:00.000Z",
      mode: "until-stop",
      stopRequested: false,
      iteration: 2,
      workerId: "w1",
    });

    const workerStop = requestLoopRunStop(root, "w0");
    expect(workerStop.ok).toBe(true);

    let status = getLoopRunStatus(root);
    expect(status.stopRequested).toBe(false);
    expect(status.coordinator?.mode).toBe("until-stop");
    expect(status.workers.find((w) => w.workerId === "w0")?.stopRequested).toBe(
      true
    );
    expect(status.workers.find((w) => w.workerId === "w1")?.stopRequested).toBe(
      false
    );

    const wholeStop = requestLoopRunStop(root);
    expect(wholeStop.ok).toBe(true);
    status = getLoopRunStatus(root);
    expect(status.stopRequested).toBe(true);

    clearCoordinatorState(root);
    clearAllWorkerRunStates(root);
  });

  it("until-stop 在无 ready Story 时等待而非退出，stop 后优雅结束", async () => {
    const { db, root } = createDb();
    const stories = db.getStories("demo");
    db.updateStory("demo", stories[0]!.id, { status: "draft" });

    const loopPromise = runLoop(db, root, {
      tool: "agent",
      untilStop: true,
      sleepMs: 30,
      projectName: "demo",
    });

    await new Promise((r) => setTimeout(r, 100));
    const status = getLoopRunStatus(root);
    expect(status.running).toBe(true);
    expect(status.state?.mode).toBe("until-stop");

    requestLoopRunStop(root);
    const result = await loopPromise;
    expect(result.completed).toBe(false);
    expect(result.untilStop).toBe(true);
    expect(result.reason).toBe("用户请求停止");
  }, 10_000);
});

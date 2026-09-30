import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoopStateDb } from "../db/db.js";
import { runPlan } from "./loop-plan.js";
import { invokeToolWithPrompt, resolveRunTool, runLoop } from "./loop-run.js";
import { initRunLive, readRunLive } from "./run-live.js";
import { invokeAgentProcess } from "./agent-invoke.js";
import { RUN_TOOLS } from "../domain/run-tool.js";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock("node:child_process", () => mocks);

describe("Codex CLI integration", () => {
  let root: string;
  let input: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "loop-codex-"));
    input = "";
    mocks.spawn.mockReset();
    mocks.spawnSync.mockReset();
    mocks.spawnSync.mockImplementation((_command, args) => ({
      status: args[0] === "codex" ? 0 : 1,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  function mockProcess(
    code: number,
    output = "CODEX_OK",
    error?: Error,
    onExit?: () => void
  ) {
    mocks.spawn.mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), {
        stdin: new PassThrough(),
        stdout: new PassThrough(),
        stderr: new PassThrough(),
      });
      child.stdin.on("data", (chunk) => { input += String(chunk); });
      process.nextTick(() => {
        if (error) {
          child.emit("error", error);
        } else {
          child.stdout.write(output);
          onExit?.();
          child.emit("close", code);
        }
      });
      return child;
    });
  }

  it("accepts an explicit codex tool", () => {
    expect(resolveRunTool("codex")).toBe("codex");
  });

  it("auto-detects codex when it is the only installed tool", () => {
    expect(resolveRunTool()).toBe("codex");
  });

  it("does not silently replace an unavailable explicit codex tool", () => {
    mocks.spawnSync.mockImplementation((_command, args) => ({
      status: args[0] === "agent" ? 0 : 1,
    }));
    expect(() => resolveRunTool("codex")).toThrow(/codex/);
  });

  it("does not substitute codex for an unavailable explicitly selected agent", () => {
    expect(() => resolveRunTool("agent")).toThrow(/未找到命令: agent/);
    expect(() => resolveRunTool("cursor")).toThrow(/未找到命令: agent/);
  });

  it("passes the prompt through stdin and preserves run live output", async () => {
    mockProcess(0);
    initRunLive(root, { tool: "codex", iteration: 1, storyId: "US-001" });
    const prompt = 'Do not interpret shell characters: & | " %PATH%\nSecond line';
    const env = { LOOP_PROJECT_ROOT: root };

    await expect(
      invokeToolWithPrompt("codex", prompt, root, root, env)
    ).resolves.toBe("CODEX_OK");
    expect(input).toBe(prompt);
    expect(mocks.spawn).toHaveBeenCalledWith(
      "codex",
      ["exec", "--dangerously-bypass-approvals-and-sandbox", "-"],
      expect.objectContaining({
        cwd: root,
        env,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      })
    );
    expect(readRunLive(root)?.output).toBe("CODEX_OK");
  });

  it("rejects nonzero exits even when the CLI printed output", async () => {
    mockProcess(1, "authentication failed");
    await expect(
      invokeToolWithPrompt("codex", "prompt", root, root, process.env)
    ).rejects.toThrow(/codex.*1/);
  });

  it("propagates CLI startup errors", async () => {
    mockProcess(1, "", new Error("spawn codex ENOENT"));
    await expect(
      invokeToolWithPrompt("codex", "prompt", root, root, process.env)
    ).rejects.toThrow(/ENOENT/);
  });

  it("launches codex for plan without modifying an existing run live state", async () => {
    mockProcess(0);
    vi.stubEnv("LOOP_PLANNER_PROMPT", "");
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    initRunLive(root, { tool: "agent", iteration: 2, storyId: "US-001" });
    const liveBefore = readRunLive(root);

    const result = await runPlan(db, root, {
      tool: "codex",
      requirement: "Codex planner regression",
    });

    expect(result).toMatchObject({ ok: true, tool: "codex", output: "CODEX_OK" });
    expect(input).toContain("Codex planner regression");
    expect(mocks.spawn.mock.calls[0]?.[0]).toBe("codex");
    expect(readRunLive(root)).toEqual(liveBefore);
  });

  it("does not report a failed Codex plan as successful", async () => {
    mockProcess(1, "authentication failed");
    vi.stubEnv("LOOP_PLANNER_PROMPT", "");
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    await expect(runPlan(db, root, { tool: "codex" })).rejects.toThrow(/codex.*1/);
  });

  it.each([0, 1])("runs a Codex iteration and records exit %i correctly", async (code) => {
    vi.stubEnv("LOOP_AGENT_PROMPT", "");
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    const story = db.addStory("demo", {
      title: "Codex smoke",
      description: "",
      workType: "testing",
      acceptanceCriteria: ["Mocked process completes"],
      status: "ready",
    });
    mockProcess(code, "CODEX_OK", undefined, () => {
      if (code === 0) {
        db.completeStoryWithProgress("demo", story.id, {
          summary: "Mocked completion",
          workerId: "w0",
        });
      }
    });

    const result = await runLoop(db, root, {
      tool: "codex",
      workers: 1,
      maxIterations: 1,
      sleepMs: 1,
    });

    expect(result.tool).toBe("codex");
    expect(result.completed).toBe(code === 0);
    expect(mocks.spawn.mock.calls[0]?.[0]).toBe("codex");
    expect(db.getStories("demo")[0]).toMatchObject({
      passes: code === 0,
      claimedBy: null,
    });
    expect(db.getRuns("demo")[0]).toMatchObject({
      tool: "codex",
      status: code === 0 ? "completed" : "failed",
    });
  });

  it.each(RUN_TOOLS)("passes a configured model to the %s adapter", async (tool) => {
    mockProcess(0);
    await invokeAgentProcess(tool, "hello", {
      cwd: root,
      model: "provider/test-model:v2",
      onDisplay: () => {},
    });
    const [command, args] = mocks.spawn.mock.calls[0]!;
    expect(command).toBe(tool === "minimax" ? "opencode" : tool === "cursor" ? "agent" : tool);
    const index = args.indexOf("--model");
    expect(index).toBeGreaterThanOrEqual(0);
    expect(args[index + 1]).toBe("provider/test-model:v2");
  });

  it("uses the selected project profile and model for planning", async () => {
    mockProcess(0);
    vi.stubEnv("LOOP_PLANNER_PROMPT", "");
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    const profile = db.saveAgentProfile("demo", { name: "Planner", tool: "codex", model: "test-model" });
    const result = await runPlan(db, root, { agentProfileId: profile.id });
    expect(result).toMatchObject({ agentProfileId: profile.id, model: "test-model", tool: "codex" });
    expect(mocks.spawn.mock.calls[0]?.[1]).toContain("test-model");
  });

  it("snapshots profile models for a run and records the effective profile", async () => {
    vi.stubEnv("LOOP_AGENT_PROMPT", "");
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    const profile = db.saveAgentProfile("demo", { name: "Worker", tool: "codex", model: "original-model" });
    for (let i = 0; i < 2; i++) {
      const s = db.addStory("demo", {
        title: `Story ${i}`, description: "", workType: "testing",
        acceptanceCriteria: ["AC"], status: "ready",
      });
      db.setStoryAgentProfile("demo", s.id, profile.id);
    }
    mockProcess(0, "OK", undefined, () => {
      const current = db.getStories("demo").find((s) => s.claimedBy === "w0")!;
      db.saveAgentProfile("demo", { ...profile, model: "next-run-model" }, profile.id);
      db.completeStoryWithProgress("demo", current.id, { summary: "done", workerId: "w0" });
    });
    const result = await runLoop(db, root, { workers: 1, maxIterations: 2, sleepMs: 1 });
    expect(result.completed).toBe(true);
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    for (const call of mocks.spawn.mock.calls) expect(call[1]).toContain("original-model");
    for (const run of db.getRuns("demo")) {
      expect(run).toMatchObject({
        agentProfileId: profile.id, agentProfileName: "Worker", model: "original-model", status: "completed",
      });
    }
    expect(db.getAgentConfig("demo").profiles[0]?.model).toBe("next-run-model");
  });
});

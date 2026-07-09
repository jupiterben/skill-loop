import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getRunLiveFile } from "../../../../src/paths.js";
import {
  appendRunLiveOutput,
  clearAllRunLive,
  clearRunLive,
  finishRunLiveForStory,
  getAllRunLiveForDashboard,
  getRunLiveForDashboard,
  initRunLive,
  patchRunLivePhase,
  readRunLive,
  writeRunLive,
} from "../../../../src/run-live.js";

describe("Agent 实时输出（run-live）", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createProjectRoot() {
    const root = mkdtempSync(join(tmpdir(), "loop-run-live-"));
    roots.push(root);
    mkdirSync(join(root, ".loop-status"), { recursive: true });
    return root;
  }

  it("readRunLive 无文件时返回 null", () => {
    const root = createProjectRoot();
    expect(readRunLive(root)).toBeNull();
    expect(existsSync(getRunLiveFile(root))).toBe(false);
  });

  it("initRunLive 写入 .loop-status/run-live.json", () => {
    const root = createProjectRoot();
    initRunLive(root, {
      iteration: 3,
      storyId: "US-027",
      tool: "agent",
      phase: "starting",
    });

    const live = readRunLive(root);
    expect(live).toMatchObject({
      iteration: 3,
      storyId: "US-027",
      tool: "agent",
      phase: "starting",
      output: "",
    });
    expect(existsSync(getRunLiveFile(root))).toBe(true);
  });

  it("worker live 写入 .loop-status/runs/<worker>-live.json", () => {
    const root = createProjectRoot();
    initRunLive(root, {
      workerId: "w0",
      iteration: 1,
      storyId: "US-027",
      tool: "agent",
    });

    const path = getRunLiveFile(root, "w0");
    expect(existsSync(path)).toBe(true);
    expect(readRunLive(root, "w0")?.workerId).toBe("w0");
  });

  it("appendRunLiveOutput 追加输出并将 phase 设为 invoking", () => {
    const root = createProjectRoot();
    initRunLive(root, { iteration: 1, storyId: "US-027", tool: "agent" });
    appendRunLiveOutput(root, "hello ");
    appendRunLiveOutput(root, "world");

    const live = readRunLive(root);
    expect(live?.output).toBe("hello world");
    expect(live?.phase).toBe("invoking");
  });

  it("patchRunLivePhase 更新阶段", () => {
    const root = createProjectRoot();
    initRunLive(root, { iteration: 1, storyId: "US-027", tool: "agent" });
    patchRunLivePhase(root, "between");
    expect(readRunLive(root)?.phase).toBe("between");
    patchRunLivePhase(root, "done");
    expect(readRunLive(root)?.phase).toBe("done");
  });

  it("getAllRunLiveForDashboard 聚合 legacy 与多 worker live", () => {
    const root = createProjectRoot();
    writeRunLive(root, {
      iteration: 1,
      storyId: "US-001",
      tool: "agent",
      phase: "invoking",
      output: "legacy",
      updatedAt: new Date().toISOString(),
    });
    writeRunLive(
      root,
      {
        workerId: "w0",
        iteration: 2,
        storyId: "US-027",
        tool: "agent",
        phase: "starting",
        output: "w0",
        updatedAt: new Date().toISOString(),
      },
      "w0"
    );
    writeRunLive(
      root,
      {
        workerId: "w1",
        iteration: 2,
        storyId: "US-028",
        tool: "agent",
        phase: "starting",
        output: "w1",
        updatedAt: new Date().toISOString(),
      },
      "w1"
    );

    const all = getAllRunLiveForDashboard(root);
    expect(all).toHaveLength(3);
    expect(all.map((l) => l.output).sort()).toEqual(["legacy", "w0", "w1"]);
  });

  it("getRunLiveForDashboard 读取主 live 文件", () => {
    const root = createProjectRoot();
    initRunLive(root, { iteration: 5, storyId: "US-027", tool: "claude" });
    expect(getRunLiveForDashboard(root)?.storyId).toBe("US-027");
  });

  it("finishRunLiveForStory 将匹配 Story 的 live phase 设为 done", () => {
    const root = createProjectRoot();
    initRunLive(root, {
      workerId: "w0",
      iteration: 1,
      storyId: "US-027",
      tool: "agent",
      phase: "invoking",
    });
    initRunLive(root, {
      workerId: "w1",
      iteration: 1,
      storyId: "US-028",
      tool: "agent",
      phase: "invoking",
    });

    finishRunLiveForStory(root, "US-027");

    expect(readRunLive(root, "w0")?.phase).toBe("done");
    expect(readRunLive(root, "w1")?.phase).toBe("invoking");
  });

  it("clearRunLive 移除指定 worker live 文件", () => {
    const root = createProjectRoot();
    initRunLive(root, {
      workerId: "w0",
      iteration: 1,
      storyId: "US-027",
      tool: "agent",
    });
    clearRunLive(root, "w0");
    expect(readRunLive(root, "w0")).toBeNull();
    expect(existsSync(getRunLiveFile(root, "w0"))).toBe(false);
  });

  it("clearAllRunLive 清除 legacy 与所有 worker live", () => {
    const root = createProjectRoot();
    initRunLive(root, { iteration: 1, storyId: "US-027", tool: "agent" });
    initRunLive(root, {
      workerId: "w0",
      iteration: 1,
      storyId: "US-027",
      tool: "agent",
    });

    clearAllRunLive(root);

    expect(readRunLive(root)).toBeNull();
    expect(readRunLive(root, "w0")).toBeNull();
    expect(getAllRunLiveForDashboard(root)).toHaveLength(0);
  });

  it("appendRunLiveOutput 超长输出截断保留尾部", () => {
    const root = createProjectRoot();
    initRunLive(root, { iteration: 1, storyId: "US-027", tool: "agent" });
    const chunk = "x".repeat(130_000);
    appendRunLiveOutput(root, chunk);

    const live = readRunLive(root);
    expect(live?.output.length).toBe(120_000);
    expect(live?.output.endsWith("x")).toBe(true);

    const raw = JSON.parse(readFileSync(getRunLiveFile(root), "utf8"));
    expect(raw.output.length).toBe(120_000);
  });
});

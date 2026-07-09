import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildStartLoopRunPayload,
  clampWorkers,
  resolveLoopRunControlView,
} from "./loopRunControlView";

const here = dirname(fileURLToPath(import.meta.url));

describe("Dashboard 启停外循环（LoopRunControl）", () => {
  it("resolveLoopRunControlView 解析运行态与工具/workers", () => {
    const view = resolveLoopRunControlView({
      running: true,
      stopRequested: false,
      coordinator: { tool: "agent", workers: 3, workerIds: ["w0", "w1", "w2"] },
      state: { tool: "agent", iteration: 5, currentStoryId: "US-031" },
      workers: [
        { workerId: "w0", tool: "agent", iteration: 5, currentStoryId: "US-031" },
      ],
    });
    expect(view.running).toBe(true);
    expect(view.tool).toBe("agent");
    expect(view.workers).toBe(3);
    expect(view.iteration).toBe(5);
  });

  it("buildStartLoopRunPayload 持续模式与 CLI --until-stop 一致", () => {
    expect(
      buildStartLoopRunPayload({
        tool: "claude",
        workers: 2,
        untilStop: true,
      })
    ).toEqual({
      tool: "claude",
      workers: 2,
      untilStop: true,
    });
  });

  it("buildStartLoopRunPayload 有限轮模式含 maxIterations", () => {
    expect(
      buildStartLoopRunPayload({
        tool: "agent",
        workers: 1,
        untilStop: false,
        maxIterations: 5,
      })
    ).toEqual({
      tool: "agent",
      workers: 1,
      untilStop: false,
      maxIterations: 5,
    });
  });

  it("clampWorkers 限制在 1–8", () => {
    expect(clampWorkers(0)).toBe(1);
    expect(clampWorkers(3)).toBe(3);
    expect(clampWorkers(99)).toBe(8);
  });

  it("api.startLoopRun / stopLoopRun 调用 loop-run 端点", () => {
    const apiSrc = readFileSync(join(here, "../../lib/api.ts"), "utf8");
    expect(apiSrc).toContain('post("/api/loop-run/start"');
    expect(apiSrc).toContain('post("/api/loop-run/stop"');
    expect(apiSrc).toContain("workers");
  });

  it("后端 /api/loop-run/start 支持 tool、workers、untilStop", () => {
    const handlersSrc = readFileSync(
      join(here, "../../../../src/api.ts"),
      "utf8"
    );
    expect(handlersSrc).toContain('pathname === "/api/loop-run/start"');
    expect(handlersSrc).toContain("startLoopRunBackground");
    expect(handlersSrc).toContain("body.workers");
    expect(handlersSrc).toContain('pathname === "/api/loop-run/stop"');
  });

  it("App.tsx 挂载 LoopRunControl 并在启停后 refresh", () => {
    const appSrc = readFileSync(join(here, "../../App.tsx"), "utf8");
    expect(appSrc).toContain("LoopRunControl");
    expect(appSrc).toContain("api.startLoopRun");
    expect(appSrc).toContain("api.stopLoopRun");
    expect(appSrc).toContain("await refresh()");
    expect(appSrc).toContain("loopRunner={data.loopRunner}");
    expect(appSrc).toContain("AgentLivePanel");
    expect(appSrc).toContain("RunsPanel");
    expect(appSrc).toContain("WorkspaceStatusBar");
  });

  it("LoopRunControl 提供启动/停止与 tool、workers 设置", () => {
    const src = readFileSync(
      join(here, "./LoopRunControl.tsx"),
      "utf8"
    );
    expect(src).toContain("启动");
    expect(src).toContain("停止");
    expect(src).toContain("LOOP_RUN_TOOLS");
    expect(src).toContain("workers");
    expect(src).toContain("until-stop");
  });
});

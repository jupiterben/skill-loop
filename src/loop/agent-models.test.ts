import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAgentModels, mergeAgentModels, parseCodexModels, readCodexModels } from "./agent-models.js";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), execFile: vi.fn() }));
vi.mock("node:child_process", () => mocks);

describe("CLI model catalogs", () => {
  beforeEach(() => {
    mocks.spawn.mockReset();
    mocks.execFile.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  function mockServer(reply: (request: Record<string, unknown>) => unknown) {
    const requests: Record<string, unknown>[] = [];
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null,
      kill: vi.fn(),
    });
    child.stdin.on("data", (chunk) => {
      const request = JSON.parse(String(chunk));
      requests.push(request);
      const response = reply(request);
      if (response) queueMicrotask(() => child.stdout.write(JSON.stringify(response) + "\n"));
    });
    mocks.spawn.mockReturnValue(child);
    return { child, requests };
  }

  it("parses public models, deduplicates IDs and skips unsafe IDs", () => {
    expect(parseCodexModels([
      { model: "test-model", displayName: "Test" },
      { model: "test-model", displayName: "Test" },
      { model: "hidden", hidden: true },
      { model: "x & echo secret" },
      { model: null },
      { model: "other-model" },
    ])).toEqual([{ id: "test-model", name: "Test" }, { id: "other-model", name: "other-model" }]);
    expect(() => parseCodexModels({})).toThrow();
  });

  it("merges only the selected CLI's saved models", () => {
    expect(mergeAgentModels("codex", [{ id: "test-model", name: "Test" }], [
      { id: "AG-001", name: "One", tool: "codex", model: "test-model", enabled: true },
      { id: "AG-002", name: "Two", tool: "codex", model: "custom", enabled: true },
      { id: "AG-003", name: "Three", tool: "claude", model: "other-cli", enabled: true },
    ])).toEqual([{ id: "test-model", name: "Test" }, { id: "custom", name: "custom" }]);
  });

  it("initializes, paginates model/list and closes without starting a task", async () => {
    const { child, requests } = mockServer((request) => {
      if (request.id === 1) return { id: 1, result: {} };
      if (request.id === 2) {
        const next = Boolean((request.params as { cursor?: string }).cursor);
        return { id: 2, result: {
          data: [{ model: next ? "model-two" : "model-one" }],
          nextCursor: next ? null : "next",
        } };
      }
    });
    await expect(readCodexModels("/project")).resolves.toHaveLength(2);
    expect(requests.map((r) => r.method)).toEqual(["initialize", "initialized", "model/list", "model/list"]);
    expect(child.kill).toHaveBeenCalledOnce();
    expect(mocks.spawn).toHaveBeenCalledWith("codex", ["app-server", "--stdio"],
      expect.objectContaining({ windowsHide: true }));
  });

  it("keeps saved models on failure and does not expose raw CLI errors", async () => {
    mockServer(() => ({ id: 1, error: { message: "secret-token" } }));
    const result = await getAgentModels("/failed-project", "codex", [
      { id: "AG-001", name: "Saved", tool: "codex", model: "saved-model", enabled: true },
    ]);
    expect(result.models).toEqual([{ id: "saved-model", name: "saved-model" }]);
    expect(result.warning).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("times out and stops an unresponsive CLI", async () => {
    vi.useFakeTimers();
    const { child } = mockServer(() => undefined);
    const result = expect(readCodexModels("/project")).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(8_001);
    await result;
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("does not launch unsupported CLIs to enumerate models", async () => {
    expect(await getAgentModels("/project", "claude", [])).toEqual({ models: [] });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});

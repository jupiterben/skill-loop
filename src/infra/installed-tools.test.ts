import { describe, expect, it, vi } from "vitest";
import { detectInstalledAgentTools, getInstalledAgentTools } from "./installed-tools.js";
import { AGENT_CLI_COMMANDS, isAgentToolInstalled } from "../domain/run-tool.js";

const mocks = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock("node:child_process", () => mocks);

describe("installed Agent CLIs", () => {
  it("only returns commands present locally, without alias entries", async () => {
    const available = vi.fn(async (tool: string) => ["agent", "codex"].includes(tool));
    expect(await detectInstalledAgentTools(available)).toEqual(["agent", "codex"]);
    expect(available.mock.calls.map(([tool]) => tool)).toEqual([...AGENT_CLI_COMMANDS]);
  });
  it("fails closed when no commands exist or detection fails", async () => {
    expect(await detectInstalledAgentTools(async () => false)).toEqual([]);
    expect(await detectInstalledAgentTools(async () => { throw new Error("probe failed"); })).toEqual([]);
  });
  it("keeps existing alias-based profiles usable via their installed command", () => {
    expect(isAgentToolInstalled("cursor", ["agent"])).toBe(true);
    expect(isAgentToolInstalled("minimax", ["opencode"])).toBe(true);
    expect(isAgentToolInstalled("minimax", ["agent", "codex"])).toBe(false);
  });
  it("uses bounded PATH lookups instead of launching agents, and caches dashboard polls", async () => {
    mocks.execFile.mockImplementation((_command, args, _options, callback) => {
      callback(args[0] === "codex" ? null : new Error("not installed"));
    });
    expect(await getInstalledAgentTools()).toEqual(["codex"]);
    expect(await getInstalledAgentTools()).toEqual(["codex"]);
    expect(mocks.execFile).toHaveBeenCalledTimes(AGENT_CLI_COMMANDS.length);
    for (const [command, args, options] of mocks.execFile.mock.calls) {
      expect(command).toBe(process.platform === "win32" ? "where.exe" : "which");
      expect(AGENT_CLI_COMMANDS).toContain(args[0]);
      expect(options).toMatchObject({ windowsHide: true, timeout: 1_500 });
    }
  });
});

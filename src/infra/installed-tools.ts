import { execFile } from "node:child_process";
import { AGENT_CLI_COMMANDS, type RunTool } from "../domain/run-tool.js";

function commandOnPath(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      process.platform === "win32" ? "where.exe" : "which",
      [command],
      { windowsHide: true, timeout: 1_500, maxBuffer: 64_000 },
      (error) => resolve(!error)
    );
  });
}

export async function detectInstalledAgentTools(
  isAvailable: (command: string) => Promise<boolean> = commandOnPath
): Promise<RunTool[]> {
  const results = await Promise.all(AGENT_CLI_COMMANDS.map(async (tool) => {
    try {
      return await isAvailable(tool) ? tool : null;
    } catch {
      return null;
    }
  }));
  return results.filter((tool): tool is (typeof AGENT_CLI_COMMANDS)[number] => tool !== null);
}

let cache: { path: string; expires: number; value: Promise<RunTool[]> } | undefined;

export async function getInstalledAgentTools(): Promise<RunTool[]> {
  const path = `${process.env.PATH ?? ""}\n${process.env.PATHEXT ?? ""}`;
  if (!cache || cache.path !== path || cache.expires <= Date.now()) {
    cache = { path, expires: Date.now() + 10_000, value: detectInstalledAgentTools() };
  }
  return [...await cache.value];
}

export const RUN_TOOLS = [
  "agent",
  "claude",
  "codebuddy",
  "opencode",
  "minimax",
  "codex",
  "cursor",
] as const;

export type RunTool = (typeof RUN_TOOLS)[number];

export const AGENT_CLI_COMMANDS = ["agent", "claude", "codebuddy", "opencode", "codex"] as const;

export function isAgentToolInstalled(tool: RunTool, installed: readonly RunTool[]): boolean {
  const command = tool === "cursor" ? "agent" : tool === "minimax" ? "opencode" : tool;
  return installed.includes(command);
}

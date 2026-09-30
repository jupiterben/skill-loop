import { spawn } from "node:child_process";
import type { RunTool } from "../domain/run-tool.js";
import { normalizeAgentModel } from "../domain/agent-config.js";
import { invokeClaudeProcess, invokeCodebuddyProcess } from "./claude-invoke.js";
import { invokeCodexProcess } from "./codex-invoke.js";
import { invokeOpencodeProcess } from "./opencode-invoke.js";

export function invokeAgentProcess(
  tool: RunTool,
  prompt: string,
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    model?: string | null;
    onDisplay: (text: string) => void;
  }
): Promise<string> {
  const model = normalizeAgentModel(options.model) ?? undefined;
  const common = {
    cwd: options.cwd,
    env: options.env,
    model,
    handlers: { onDisplay: options.onDisplay },
  };
  if (tool === "codex") return invokeCodexProcess(prompt, common);
  if (tool === "claude") return invokeClaudeProcess(prompt, common);
  if (tool === "codebuddy") return invokeCodebuddyProcess(prompt, common);
  if (tool === "opencode" || tool === "minimax") {
    return invokeOpencodeProcess(prompt, {
      ...common,
      model: model ?? (tool === "minimax" ? "free/minimax-m3" : undefined),
    });
  }
  return new Promise((resolve, reject) => {
    const args = ["-p", "--force", ...(model ? ["--model", model] : []), prompt];
    const child = spawn("agent", args, {
      cwd: options.cwd,
      env: options.env,
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const onData = (chunk: Buffer | string) => {
      const text = String(chunk);
      output += text;
      options.onDisplay(text);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error(`agent exit code ${code ?? "unknown"}`));
      else resolve(output);
    });
  });
}

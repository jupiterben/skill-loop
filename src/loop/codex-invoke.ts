import { spawn } from "node:child_process";
import { normalizeAgentModel } from "../domain/agent-config.js";
import { armProcessTimeout } from "./invoke-timeout.js";

export function invokeCodexProcess(
  prompt: string,
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    model?: string;
    handlers: { onDisplay: (text: string) => void };
    executable?: string | null;
    args?: string[];
    timeoutMs?: number | null;
  }
): Promise<string> {
  const model = normalizeAgentModel(options.model);
  return new Promise((resolve, reject) => {
    const args = [
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      ...(model ? ["--model", model] : []),
      ...(options.args ?? []),
      "-",
    ];
    const child = spawn(options.executable?.trim() || "codex", args, {
      cwd: options.cwd,
      env: options.env,
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    const onData = (chunk: Buffer | string) => {
      const text = String(chunk);
      output += text;
      options.handlers.onDisplay(text);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", reject);
    child.stdin.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`codex 退出码 ${code ?? "unknown"}`));
      } else {
        resolve(output);
      }
    });
    armProcessTimeout(child, options.timeoutMs, () =>
      reject(new Error(`codex 超时（${options.timeoutMs}ms）`))
    );
    child.stdin.end(prompt);
  });
}

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LoopStateDb } from "./db.js";
import { getPackageRoot } from "./config.js";
import { getProjectName } from "./get-project-name.js";
import { getStateDir } from "./paths.js";
import { resolveRunTool } from "./loop-run.js";

export type PlanOptions = {
  tool?: string;
  projectName?: string;
  storyId?: string;
  requirement?: string;
};

export type PlanResult = {
  ok: boolean;
  tool: string;
  promptPath: string;
  storyId: string | null;
  output: string;
};

function resolvePlannerPromptPath(projectRoot: string): string {
  const custom = process.env.LOOP_PLANNER_PROMPT?.trim();
  if (custom && existsSync(custom)) return custom;

  const inProject = join(getStateDir(projectRoot), "PLANNER.md");
  if (existsSync(inProject)) return inProject;

  return join(getPackageRoot(), "templates", "PLANNER.md");
}

function buildPrompt(
  basePath: string,
  input: { storyId?: string; requirement?: string }
): string {
  const base = readFileSync(basePath, "utf8");
  const parts = [base.trim()];

  if (input.storyId || input.requirement) {
    parts.push("", "## 本轮输入", "");
    if (input.storyId) {
      parts.push(`- **目标 Story**：\`${input.storyId}\`（优先修改此 Story）`);
    }
    if (input.requirement) {
      parts.push(`- **用户需求**：${input.requirement}`);
    }
  }

  return `${parts.join("\n")}\n`;
}

async function invokeTool(
  tool: ReturnType<typeof resolveRunTool>,
  prompt: string,
  cwd: string
): Promise<string> {
  const { spawn } = await import("node:child_process");

  if (tool === "claude") {
    const child = spawn(
      "claude",
      ["--dangerously-skip-permissions", "--print"],
      {
        cwd,
        shell: process.platform === "win32",
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    child.stdin?.write(prompt);
    child.stdin?.end();
    return new Promise((resolve, reject) => {
      let output = "";
      child.stdout?.on("data", (chunk) => {
        const text = String(chunk);
        output += text;
        if (text.trim()) process.stdout.write(text);
      });
      child.stderr?.on("data", (chunk) => {
        const text = String(chunk);
        output += text;
        if (text.trim()) process.stderr.write(text);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0 && !output.trim()) {
          reject(new Error(`claude 退出码 ${code ?? "unknown"}`));
          return;
        }
        resolve(output);
      });
    });
  }

  if (tool === "amp") {
    const child = spawn("amp", ["--dangerously-allow-all"], {
      cwd,
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin?.write(prompt);
    child.stdin?.end();
    return new Promise((resolve, reject) => {
      let output = "";
      child.stdout?.on("data", (chunk) => {
        output += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        output += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0 && !output.trim()) {
          reject(new Error(`amp 退出码 ${code ?? "unknown"}`));
          return;
        }
        resolve(output);
      });
    });
  }

  const child = spawn("agent", ["-p", "--force", prompt], {
    cwd,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let output = "";
    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
      if (text.trim()) process.stdout.write(text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      output += text;
      if (text.trim()) process.stderr.write(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && !output.trim()) {
        reject(new Error(`agent 退出码 ${code ?? "unknown"}`));
        return;
      }
      resolve(output);
    });
  });
}

export async function runPlan(
  db: LoopStateDb,
  projectRoot: string,
  options: PlanOptions = {}
): Promise<PlanResult> {
  const tool = resolveRunTool(options.tool);
  const projectName = getProjectName(db, options.projectName);
  const promptPath = resolvePlannerPromptPath(projectRoot);

  if (!existsSync(promptPath)) {
    throw new Error(`找不到 Planner 提示词: ${promptPath}`);
  }

  const status = db.getStatus(projectName);
  const storyId =
    options.storyId?.trim() ||
    status.nextStory?.id ||
    status.currentStory?.id ||
    null;

  const prompt = buildPrompt(promptPath, {
    storyId: storyId ?? undefined,
    requirement: options.requirement?.trim(),
  });

  console.error(`Loop Planner — 工具: ${tool}`);
  console.error(`提示词: ${promptPath}`);
  console.error(`项目: ${projectName} @ ${projectRoot}`);
  if (storyId) console.error(`目标 Story: ${storyId}`);

  const output = await invokeTool(tool, prompt, projectRoot);

  return {
    ok: true,
    tool,
    promptPath,
    storyId,
    output,
  };
}

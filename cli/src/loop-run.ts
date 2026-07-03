import { spawnSync, spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { LoopStateDb } from "./db.js";
import { getPackageRoot } from "./config.js";
import { getProjectName } from "./get-project-name.js";
import { getStateDir } from "./paths.js";
import {
  clearLoopRunState,
  isLoopRunStopRequested,
  readLoopRunState,
  writeLoopRunState,
} from "./run-process.js";
import {
  appendRunLiveOutput,
  initRunLive,
  patchRunLivePhase,
} from "./run-live.js";

const COMPLETE_TAG = "<promise>COMPLETE</promise>";
const VALID_TOOLS = ["claude", "amp", "agent", "cursor"] as const;
type RunTool = (typeof VALID_TOOLS)[number];

export type LoopRunOptions = {
  tool?: string;
  maxIterations?: number;
  untilStop?: boolean;
  projectName?: string;
  sleepMs?: number;
};

export type LoopRunResult = {
  completed: boolean;
  iterations: number;
  maxIterations: number | null;
  untilStop: boolean;
  tool: string;
  reason: string;
};

function commandExists(cmd: string): boolean {
  const check =
    process.platform === "win32"
      ? spawnSync("where", [cmd], { stdio: "ignore", shell: true })
      : spawnSync("which", [cmd], { stdio: "ignore" });
  return check.status === 0;
}

function resolveTool(preferred?: string): RunTool {
  const tool = preferred?.trim().toLowerCase();
  if (tool) {
    if (tool === "cursor") {
      if (commandExists("agent")) return "agent";
    } else if (!VALID_TOOLS.includes(tool as RunTool)) {
      throw new Error(`无效 --tool: ${preferred}（支持 claude | amp | agent | cursor）`);
    } else if (commandExists(tool === "agent" ? "agent" : tool)) {
      return tool as RunTool;
    } else if (tool !== "agent" && tool !== "cursor") {
      throw new Error(`未找到命令: ${tool}`);
    }
    // agent/cursor 未安装时继续自动探测 claude / amp
  }

  if (commandExists("agent")) return "agent";
  if (commandExists("claude")) return "claude";
  if (commandExists("amp")) return "amp";

  throw new Error(
    [
      "未找到 AI 工具（agent / claude / amp）。",
      "",
      "  Cursor: 安装 Cursor CLI 后使用 agent",
      "  Claude: npm install -g @anthropic-ai/claude-code",
      "  或指定: pnpm loop run --tool claude 10",
    ].join("\n")
  );
}

/** 解析外循环 AI 工具（供 launcher 预检） */
export function resolveRunTool(preferred?: string): RunTool {
  return resolveTool(preferred);
}

function resolvePromptPath(projectRoot: string): string {
  const custom = process.env.LOOP_AGENT_PROMPT?.trim();
  if (custom && existsSync(custom)) return custom;

  const inProject = join(getStateDir(projectRoot), "AGENT.md");
  if (existsSync(inProject)) return inProject;

  return join(getPackageRoot(), "templates", "AGENT.md");
}

function maybeArchivePreviousRun(projectRoot: string, db: LoopStateDb, projectName: string): void {
  const stateDir = getStateDir(projectRoot);
  const lastBranchFile = join(stateDir, ".last-branch");
  const meta = db.getProjectMeta(projectName);
  const currentBranch = meta.branchName;
  if (!currentBranch) return;

  if (existsSync(lastBranchFile)) {
    const lastBranch = readFileSync(lastBranchFile, "utf8").trim();
    if (lastBranch && lastBranch !== currentBranch) {
      const date = new Date().toISOString().slice(0, 10);
      const folder = join(
        stateDir,
        "archive",
        `${date}-${lastBranch.replace(/\//g, "-")}`
      );
      mkdirSync(folder, { recursive: true });
      for (const name of ["project.json", "patterns.json", "progress.json", "runs.json"]) {
        const src = join(stateDir, name);
        if (existsSync(src)) copyFileSync(src, join(folder, name));
      }
      console.error(`已归档上一轮 (${lastBranch}) → ${folder}`);
    }
  }

  writeFileSync(lastBranchFile, currentBranch, "utf8");
}

function streamProcessOutput(
  projectRoot: string,
  child: ReturnType<typeof spawn>
): Promise<{ output: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    let output = "";
    const onData = (chunk: Buffer | string) => {
      const text = String(chunk);
      output += text;
      appendRunLiveOutput(projectRoot, text);
      if (text.trim()) process.stdout.write(text);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", reject);
    child.on("close", (code) => resolve({ output, code }));
  });
}

async function invokeTool(
  tool: RunTool,
  promptPath: string,
  cwd: string,
  projectRoot: string
): Promise<string> {
  const prompt = readFileSync(promptPath, "utf8");
  patchRunLivePhase(projectRoot, "invoking");

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
    const { output, code } = await streamProcessOutput(projectRoot, child);
    if (code !== 0 && !output.trim()) {
      throw new Error(`claude 退出码 ${code ?? "unknown"}`);
    }
    return output;
  }

  if (tool === "amp") {
    const child = spawn("amp", ["--dangerously-allow-all"], {
      cwd,
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin?.write(prompt);
    child.stdin?.end();
    const { output, code } = await streamProcessOutput(projectRoot, child);
    if (code !== 0 && !output.trim()) {
      throw new Error(`amp 退出码 ${code ?? "unknown"}`);
    }
    return output;
  }

  const child = spawn("agent", ["-p", "--force", prompt], {
    cwd,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const { output, code } = await streamProcessOutput(projectRoot, child);
  if (code !== 0 && !output.trim()) {
    throw new Error(`agent 退出码 ${code ?? "unknown"}`);
  }
  return output;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runLoop(
  db: LoopStateDb,
  projectRoot: string,
  options: LoopRunOptions = {}
): Promise<LoopRunResult> {
  const untilStop = options.untilStop === true;
  const maxIterations = untilStop ? null : (options.maxIterations ?? 10);
  const sleepMs = options.sleepMs ?? 2000;
  const tool = resolveTool(options.tool);
  const projectName = getProjectName(db, options.projectName);
  const promptPath = resolvePromptPath(projectRoot);

  if (!existsSync(promptPath)) {
    throw new Error(`找不到 Agent 提示词: ${promptPath}`);
  }

  maybeArchivePreviousRun(projectRoot, db, projectName);

  const status = db.getStatus(projectName);
  if (status.isComplete) {
    return {
      completed: true,
      iterations: 0,
      maxIterations,
      untilStop,
      tool,
      reason: "所有 Story 已完成",
    };
  }

  writeLoopRunState(projectRoot, {
    pid: process.pid,
    tool,
    startedAt: new Date().toISOString(),
    mode: untilStop ? "until-stop" : "limited",
    maxIterations: maxIterations ?? undefined,
    stopRequested: false,
  });

  const finish = (result: LoopRunResult): LoopRunResult => {
    patchRunLivePhase(projectRoot, "done");
    clearLoopRunState(projectRoot);
    return result;
  };

  console.error(
    untilStop
      ? `Loop 外循环启动 — 工具: ${tool} — 持续运行（loop run stop 结束）`
      : `Loop 外循环启动 — 工具: ${tool} — 最多 ${maxIterations} 轮`
  );
  console.error(`提示词: ${promptPath}`);
  console.error(`项目: ${projectName} @ ${projectRoot}`);

  try {
    for (let i = 1; ; i++) {
      if (isLoopRunStopRequested(projectRoot)) {
        const active = db.getActiveRun(projectName);
        if (active?.id != null) {
          db.endRun(active.id, "completed", "stopped by user");
        }
        console.error("");
        console.error(`Loop 已停止（用户请求，共 ${i - 1} 轮）`);
        return finish({
          completed: false,
          iterations: Math.max(0, i - 1),
          maxIterations,
          untilStop,
          tool,
          reason: "用户请求停止",
        });
      }

      if (db.getStatus(projectName).isComplete) {
        return finish({
          completed: true,
          iterations: i - 1,
          maxIterations,
          untilStop,
          tool,
          reason: "所有 Story 已完成",
        });
      }

      if (!untilStop && maxIterations != null && i > maxIterations) {
        break;
      }

      const iterLabel = untilStop
        ? `${i} (∞)`
        : `${i} / ${maxIterations}`;

      console.error("");
      console.error("===============================================================");
      console.error(` Loop 迭代 ${iterLabel} (${tool})`);
      console.error("===============================================================");

      const currentStory = db.getNextStory(projectName);
      const run = db.startRun(
        projectName,
        i,
        tool,
        currentStory?.id ?? null
      );
      initRunLive(projectRoot, {
        iteration: i,
        storyId: currentStory?.id ?? null,
        tool,
        phase: "starting",
      });
      const runState = readLoopRunState(projectRoot);
      if (runState) {
        writeLoopRunState(projectRoot, {
          ...runState,
          iteration: i,
          currentStoryId: currentStory?.id ?? null,
        });
      }
      const runId = run.id;
      if (runId == null) throw new Error("startRun 未返回 run id");

      try {
        const output = await invokeTool(tool, promptPath, projectRoot, projectRoot);
        patchRunLivePhase(projectRoot, "between");

        const doneByTag = output.includes(COMPLETE_TAG);
        const doneByStatus = db.getStatus(projectName).isComplete;

        if (doneByTag || doneByStatus) {
          db.endRun(runId, "completed", "all stories complete");
          console.error("");
          console.error(`Loop 完成！（第 ${i} 轮）`);
          return finish({
            completed: true,
            iterations: i,
            maxIterations,
            untilStop,
            tool,
            reason: doneByTag ? "agent 返回 COMPLETE" : "status.isComplete",
          });
        }

        db.endRun(runId, "completed", "iteration finished");
        console.error(`第 ${i} 轮结束，继续下一轮…`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        db.endRun(runId, "failed", message);
        console.error(`第 ${i} 轮失败: ${message}`);
      }

      await sleep(sleepMs);
    }

    const active = db.getActiveRun(projectName);
    if (active?.id != null) {
      db.endRun(
        active.id,
        "max_iterations",
        `已达最大迭代次数 (${maxIterations})`
      );
    }

    return finish({
      completed: false,
      iterations: maxIterations ?? 0,
      maxIterations,
      untilStop,
      tool,
      reason: `已达最大迭代次数 (${maxIterations})`,
    });
  } catch (err) {
    patchRunLivePhase(projectRoot, "done");
    clearLoopRunState(projectRoot);
    throw err;
  }
}

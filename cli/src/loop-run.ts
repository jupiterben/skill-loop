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
import { getLastBranchFile, getRunArchiveDir, getRunsFile, getStateDir } from "./paths.js";
import {
  clearCoordinatorState,
  clearLoopRunState,
  clearAllWorkerRunStates,
  isLoopRunStopRequested,
  readLoopRunState,
  writeCoordinatorState,
  writeLoopRunState,
  writeWorkerRunState,
  clearWorkerRunState,
} from "./run-process.js";
import {
  appendRunLiveOutput,
  clearAllRunLive,
  initRunLive,
  patchRunLivePhase,
} from "./run-live.js";

function clearLoopRunCurrentStory(projectRoot: string): void {
  const runState = readLoopRunState(projectRoot);
  if (runState?.currentStoryId) {
    writeLoopRunState(projectRoot, { ...runState, currentStoryId: null });
  }
}
import { invokeClaudeProcess } from "./claude-invoke.js";
import {
  cleanupAllWorktrees,
  createWorktree,
  mergeWorktreeBranch,
  removeWorktree,
  type WorktreeHandle,
} from "./worktree-pool.js";
import type { UserStory } from "./types.js";

const COMPLETE_TAG = "<promise>COMPLETE</promise>";
const VALID_TOOLS = ["claude", "amp", "agent", "cursor"] as const;
const STORY_RESOLVE_TOOLS = ["claude", "codex", "agent", "cursor"] as const;
type RunTool = (typeof VALID_TOOLS)[number];
type StoryPreferredTool = (typeof STORY_RESOLVE_TOOLS)[number];
type StoryResolvedTool = StoryPreferredTool | Extract<RunTool, "amp">;

export type LoopRunOptions = {
  tool?: string;
  maxIterations?: number;
  untilStop?: boolean;
  projectName?: string;
  sleepMs?: number;
  workers?: number;
};

export type LoopRunResult = {
  completed: boolean;
  iterations: number;
  maxIterations: number | null;
  untilStop: boolean;
  tool: string;
  workers: number;
  reason: string;
};

function workerIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `w${i}`);
}

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

export function resolveRunTool(preferred?: string): RunTool {
  return resolveTool(preferred);
}

function tryMapPreferred(
  preferred: string | null | undefined,
  isAvailable: (cmd: string) => boolean
): StoryPreferredTool | null {
  const tool = preferred?.trim().toLowerCase();
  if (!tool) return null;
  if (!STORY_RESOLVE_TOOLS.includes(tool as StoryPreferredTool)) return null;
  if (tool === "cursor") {
    return isAvailable("agent") ? "agent" : null;
  }
  return isAvailable(tool) ? (tool as StoryPreferredTool) : null;
}

function tryMapRunPreferred(
  preferred: string | null | undefined,
  isAvailable: (cmd: string) => boolean
): StoryResolvedTool | null {
  const tool = preferred?.trim().toLowerCase();
  if (tool === "amp") return isAvailable("amp") ? "amp" : null;
  return tryMapPreferred(preferred, isAvailable);
}

function autoDetectTool(isAvailable: (cmd: string) => boolean): StoryPreferredTool {
  if (isAvailable("agent")) return "agent";
  if (isAvailable("claude")) return "claude";
  if (isAvailable("codex")) return "codex";
  throw new Error(
    [
      "未找到 AI 工具（agent / claude / codex）。",
      "",
      "  Cursor: 安装 Cursor CLI 后使用 agent",
      "  Claude: npm install -g @anthropic-ai/claude-code",
      "  Codex: 安装 OpenAI Codex CLI 后使用 codex",
      "  或指定: pnpm loop run --tool claude 10",
    ].join("\n")
  );
}

export function resolveStoryTool(
  story: { preferredTool?: string | null },
  runPreferred?: string | null,
  options?: { isAvailable?: (cmd: string) => boolean }
): StoryResolvedTool {
  const isAvailable = options?.isAvailable ?? commandExists;
  return (
    tryMapPreferred(story.preferredTool, isAvailable) ??
    tryMapRunPreferred(runPreferred, isAvailable) ??
    autoDetectTool(isAvailable)
  );
}

export function resolveAgentPromptPath(projectRoot: string): string {
  const custom = process.env.LOOP_AGENT_PROMPT?.trim();
  if (custom && existsSync(custom)) return custom;

  const inProject = join(getStateDir(projectRoot), "AGENT.md");
  if (existsSync(inProject)) return inProject;

  return join(getPackageRoot(), "templates", "AGENT.md");
}

function resolvePromptPath(projectRoot: string): string {
  return resolveAgentPromptPath(projectRoot);
}

function maybeArchivePreviousRun(
  projectRoot: string,
  db: LoopStateDb,
  projectName: string
): void {
  const stateDir = getStateDir(projectRoot);
  const lastBranchFile = getLastBranchFile(projectRoot);
  const meta = db.getProjectMeta(projectName);
  const currentBranch = meta.branchName;
  if (!currentBranch) return;

  if (existsSync(lastBranchFile)) {
    const lastBranch = readFileSync(lastBranchFile, "utf8").trim();
    if (lastBranch && lastBranch !== currentBranch) {
      const date = new Date().toISOString().slice(0, 10);
      const folder = join(
        getRunArchiveDir(projectRoot),
        `${date}-${lastBranch.replace(/\//g, "-")}`
      );
      mkdirSync(folder, { recursive: true });
      for (const name of ["project.json", "patterns.json", "progress.json"]) {
        const src = join(stateDir, name);
        if (existsSync(src)) copyFileSync(src, join(folder, name));
      }
      const runsSrc = getRunsFile(projectRoot);
      if (existsSync(runsSrc)) copyFileSync(runsSrc, join(folder, "runs.json"));
      console.error(`已归档上一轮 (${lastBranch}) → ${folder}`);
    }
  }

  writeFileSync(lastBranchFile, currentBranch, "utf8");
}

function streamProcessOutput(
  projectRoot: string,
  child: ReturnType<typeof spawn>,
  workerId?: string
): Promise<{ output: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    let output = "";
    const onData = (chunk: Buffer | string) => {
      const text = String(chunk);
      output += text;
      appendRunLiveOutput(projectRoot, text, workerId);
      if (text.trim()) process.stdout.write(text);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", reject);
    child.on("close", (code) => resolve({ output, code }));
  });
}

export async function invokeToolWithPrompt(
  tool: StoryResolvedTool,
  prompt: string,
  cwd: string,
  projectRoot: string,
  env: NodeJS.ProcessEnv,
  workerId?: string
): Promise<string> {
  patchRunLivePhase(projectRoot, "invoking", workerId);

  if (tool === "claude") {
    return invokeClaudeProcess(prompt, {
      cwd,
      env,
      handlers: {
        onDisplay: (text) => {
          appendRunLiveOutput(projectRoot, text, workerId);
          if (text.trim()) process.stdout.write(text);
        },
      },
    });
  }

  if (tool === "amp") {
    const child = spawn("amp", ["--dangerously-allow-all"], {
      cwd,
      env,
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin?.write(prompt);
    child.stdin?.end();
    const { output, code } = await streamProcessOutput(projectRoot, child, workerId);
    if (code !== 0 && !output.trim()) {
      throw new Error(`amp 退出码 ${code ?? "unknown"}`);
    }
    return output;
  }

  if (tool === "codex") {
    const child = spawn(
      "codex",
      ["exec", "--dangerously-bypass-approvals-and-sandbox", "-"],
      {
        cwd,
        env,
        shell: process.platform === "win32",
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    child.stdin?.write(prompt);
    child.stdin?.end();
    const { output, code } = await streamProcessOutput(projectRoot, child, workerId);
    if (code !== 0 && !output.trim()) {
      throw new Error(`codex 退出码 ${code ?? "unknown"}`);
    }
    return output;
  }

  const child = spawn("agent", ["-p", "--force", prompt], {
    cwd,
    env,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const { output, code } = await streamProcessOutput(projectRoot, child, workerId);
  if (code !== 0 && !output.trim()) {
    throw new Error(`agent 退出码 ${code ?? "unknown"}`);
  }
  return output;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const waitStatusLine = {
  lastLen: 0,
  lastPlainMessage: "",
  write(base: string): void {
    if (process.stderr.isTTY) {
      const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      const message = `${base} (${time})`;
      const padded = message.padEnd(this.lastLen, " ");
      process.stderr.write(`\r${padded}`);
      this.lastLen = message.length;
      return;
    }
    if (base !== this.lastPlainMessage) {
      console.error(base);
      this.lastPlainMessage = base;
    }
  },
  clear(): void {
    if (process.stderr.isTTY && this.lastLen > 0) {
      process.stderr.write(`\r${" ".repeat(this.lastLen)}\r`);
      this.lastLen = 0;
    }
    this.lastPlainMessage = "";
  },
};

function buildWorkerEnv(
  base: NodeJS.ProcessEnv,
  workerId: string,
  storyId: string,
  projectRoot: string
): NodeJS.ProcessEnv {
  return {
    ...base,
    LOOP_PROJECT_ROOT: projectRoot,
    LOOP_WORKER_ID: workerId,
    LOOP_CLAIMED_STORY_ID: storyId,
  };
}

function buildAgentPrompt(
  basePath: string,
  input: { workerId: string; story: UserStory }
): string {
  const base = readFileSync(basePath, "utf8");
  const { workerId, story } = input;
  const criteria = (story.acceptanceCriteria ?? [])
    .map((c) => `  - ${c}`)
    .join("\n");

  return [
    base.trim(),
    "",
    "## 本轮任务（协调器分配，必须遵守）",
    "",
    `- **Worker**：\`${workerId}\``,
    `- **Story ID**：\`${story.id}\`（仅实现此 Story，禁止改做其他 Story）`,
    `- **标题**：${story.title}`,
    story.description ? `- **描述**：${story.description}` : "",
    criteria ? `- **验收标准**：\n${criteria}` : "",
    "",
    "实现并 `pnpm loop complete` 上述 Story 后，运行 `pnpm loop status` 查看全局进度。",
    "仅当 status 输出中 `isComplete` 为 `true` 时才回复 `<promise>COMPLETE</promise>`；否则禁止输出该标记。",
  ]
    .filter(Boolean)
    .join("\n");
}

function releaseAllClaims(db: LoopStateDb, projectName: string): void {
  for (const story of db.getStories(projectName)) {
    if (story.claimedBy) {
      try {
        db.releaseClaim(projectName, story.id);
      } catch {
        /* best effort */
      }
    }
  }
}

type WorkerIterationResult = {
  completed: boolean;
  failed: boolean;
};

async function runWorkerIteration(
  db: LoopStateDb,
  projectRoot: string,
  projectName: string,
  input: {
    workerId: string;
    story: UserStory;
    iteration: number;
    tool: RunTool;
    promptPath: string;
    baseBranch: string;
    useWorktree: boolean;
  }
): Promise<WorkerIterationResult> {
  const { workerId, story, iteration, tool, promptPath, baseBranch, useWorktree } =
    input;
  let worktree: WorktreeHandle | null = null;
  let runId: number | null = null;

  try {
    db.claimStory(projectName, story.id, workerId);

    const effectiveTool = resolveStoryTool(story, tool);

    const cwd = useWorktree
      ? (worktree = createWorktree(
          projectRoot,
          workerId,
          story.id,
          baseBranch
        )).path
      : projectRoot;

    const run = db.startRun(
      projectName,
      iteration,
      effectiveTool,
      story.id,
      workerId
    );
    runId = run.id ?? null;
    if (runId == null) throw new Error("startRun 未返回 run id");

    initRunLive(projectRoot, {
      workerId,
      iteration,
      storyId: story.id,
      tool: effectiveTool,
      phase: "starting",
    });

    writeWorkerRunState(projectRoot, workerId, {
      pid: process.pid,
      tool: effectiveTool,
      startedAt: new Date().toISOString(),
      mode: "until-stop",
      stopRequested: false,
      iteration,
      currentStoryId: story.id,
      workerId,
    });

    const env = buildWorkerEnv(process.env, workerId, story.id, projectRoot);
    const prompt = buildAgentPrompt(promptPath, { workerId, story });
    const output = await invokeToolWithPrompt(
      effectiveTool,
      prompt,
      cwd,
      projectRoot,
      env,
      workerId
    );
    patchRunLivePhase(projectRoot, "between", workerId);

    if (useWorktree && worktree) {
      mergeWorktreeBranch(projectRoot, worktree, baseBranch);
    }

    const doneByStatus = db.getStatus(projectName).isComplete;
    const doneByTag = output.includes(COMPLETE_TAG);
    const storyDone =
      db.getStories(projectName).find((s) => s.id === story.id)?.passes === true;

    if (doneByTag && !doneByStatus) {
      console.error(
        `[${workerId}] 警告: agent 返回 COMPLETE 但 isComplete=false，忽略并继续外循环`
      );
    }

    if (doneByStatus) {
      db.endRun(runId, "completed", "all stories complete");
      return { completed: true, failed: false };
    }

    db.endRun(runId, "completed", "iteration finished");
    if (!storyDone) {
      try {
        db.releaseClaim(projectName, story.id, workerId);
      } catch {
        /* ignore */
      }
    }
    return { completed: false, failed: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (runId != null) db.endRun(runId, "failed", message);
    try {
      db.releaseClaim(projectName, story.id, workerId);
    } catch {
      /* ignore */
    }
    console.error(`[${workerId}] 第 ${iteration} 轮失败 (${story.id}): ${message}`);
    return { completed: false, failed: true };
  } finally {
    if (useWorktree) removeWorktree(projectRoot, workerId);
    clearWorkerRunState(projectRoot, workerId);
    patchRunLivePhase(projectRoot, "done", workerId);
  }
}

async function runParallelLoop(
  db: LoopStateDb,
  projectRoot: string,
  options: {
    untilStop: boolean;
    maxIterations: number | null;
    sleepMs: number;
    tool: RunTool;
    projectName: string;
    promptPath: string;
    workers: number;
  }
): Promise<LoopRunResult> {
  const {
    untilStop,
    maxIterations,
    sleepMs,
    tool,
    projectName,
    promptPath,
    workers,
  } = options;
  const ids = workerIds(workers);
  const baseBranch = db.getProjectMeta(projectName).branchName;
  const useWorktree = workers > 1;

  writeCoordinatorState(projectRoot, {
    pid: process.pid,
    tool,
    startedAt: new Date().toISOString(),
    mode: untilStop ? "until-stop" : "limited",
    maxIterations: maxIterations ?? undefined,
    stopRequested: false,
    workers,
    workerIds: ids,
  });

  const finish = (result: LoopRunResult): LoopRunResult => {
    waitStatusLine.clear();
    releaseAllClaims(db, projectName);
    clearAllRunLive(projectRoot);
    clearCoordinatorState(projectRoot);
    clearAllWorkerRunStates(projectRoot);
    if (useWorktree) cleanupAllWorktrees(projectRoot);
    return result;
  };

  console.error(
    untilStop
      ? `Loop 并行外循环 — ${workers} workers — 工具: ${tool} — 持续运行`
      : `Loop 并行外循环 — ${workers} workers — 工具: ${tool} — 最多 ${maxIterations} 轮`
  );
  console.error(`提示词: ${promptPath}`);
  console.error(`项目: ${projectName} @ ${projectRoot}`);

  let batch = 0;

  try {
    while (true) {
      batch++;
      if (isLoopRunStopRequested(projectRoot)) {
        for (const run of db.getActiveRuns(projectName)) {
          if (run.id != null) {
            db.endRun(run.id, "completed", "stopped by user");
          }
        }
        console.error(`Loop 已停止（用户请求，共 ${batch - 1} 批）`);
        return finish({
          completed: false,
          iterations: Math.max(0, batch - 1),
          maxIterations,
          untilStop,
          tool,
          workers,
          reason: "用户请求停止",
        });
      }

      if (!untilStop && db.getStatus(projectName).isComplete) {
        return finish({
          completed: true,
          iterations: batch - 1,
          maxIterations,
          untilStop,
          tool,
          workers,
          reason: "所有 Story 已完成",
        });
      }

      if (!untilStop && maxIterations != null && batch > maxIterations) {
        break;
      }

      const stories = db.getNextStories(projectName, workers);
      if (!stories.length) {
        if (!untilStop && db.getStatus(projectName).isComplete) {
          return finish({
            completed: true,
            iterations: batch - 1,
            maxIterations,
            untilStop,
            tool,
            workers,
            reason: "所有 Story 已完成",
          });
        }
        waitStatusLine.write(
          db.getStatus(projectName).isComplete
            ? "所有 Story 已完成，继续监听…"
            : "无可并行 Story，等待…"
        );
        await sleep(sleepMs);
        continue;
      }

      waitStatusLine.clear();
      console.error("");
      console.error("===============================================================");
      console.error(
        ` Loop 批次 ${untilStop ? `${batch} (∞)` : `${batch} / ${maxIterations}`} — ${stories.length} worker(s)`
      );
      console.error("===============================================================");

      const results = await Promise.all(
        stories.map((story, idx) =>
          runWorkerIteration(db, projectRoot, projectName, {
            workerId: ids[idx]!,
            story,
            iteration: batch,
            tool,
            promptPath,
            baseBranch,
            useWorktree,
          })
        )
      );

      if (results.some((r) => r.completed)) {
        if (!untilStop) {
          console.error("");
          console.error(`Loop 完成！（第 ${batch} 批）`);
          return finish({
            completed: true,
            iterations: batch,
            maxIterations,
            untilStop,
            tool,
            workers,
            reason: "agent 返回 COMPLETE 或全部 Story 已完成",
          });
        }
        waitStatusLine.write("所有 Story 已完成，继续监听…");
        await sleep(sleepMs);
        continue;
      }

      waitStatusLine.clear();
      console.error(`第 ${batch} 批结束，继续…`);
      await sleep(sleepMs);
    }

    for (const run of db.getActiveRuns(projectName)) {
      if (run.id != null) {
        db.endRun(
          run.id,
          "max_iterations",
          `已达最大迭代次数 (${maxIterations})`
        );
      }
    }

    return finish({
      completed: false,
      iterations: maxIterations ?? 0,
      maxIterations,
      untilStop,
      tool,
      workers,
      reason: `已达最大迭代次数 (${maxIterations})`,
    });
  } catch (err) {
    clearCoordinatorState(projectRoot);
    clearAllWorkerRunStates(projectRoot);
    cleanupAllWorktrees(projectRoot);
    throw err;
  }
}

async function runSequentialLoop(
  db: LoopStateDb,
  projectRoot: string,
  options: {
    untilStop: boolean;
    maxIterations: number | null;
    sleepMs: number;
    tool: RunTool;
    projectName: string;
    promptPath: string;
  }
): Promise<LoopRunResult> {
  const { untilStop, maxIterations, sleepMs, tool, projectName, promptPath } =
    options;

  writeLoopRunState(projectRoot, {
    pid: process.pid,
    tool,
    startedAt: new Date().toISOString(),
    mode: untilStop ? "until-stop" : "limited",
    maxIterations: maxIterations ?? undefined,
    stopRequested: false,
  });

  const finish = (result: LoopRunResult): LoopRunResult => {
    waitStatusLine.clear();
    releaseAllClaims(db, projectName);
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
          workers: 1,
          reason: "用户请求停止",
        });
      }

      if (!untilStop && db.getStatus(projectName).isComplete) {
        return finish({
          completed: true,
          iterations: i - 1,
          maxIterations,
          untilStop,
          tool,
          workers: 1,
          reason: "所有 Story 已完成",
        });
      }

      if (!untilStop && maxIterations != null && i > maxIterations) {
        break;
      }

      const currentStory = db.getNextStory(projectName);
      if (!currentStory) {
        clearLoopRunCurrentStory(projectRoot);
        waitStatusLine.write(
          db.getStatus(projectName).isComplete
            ? "所有 Story 已完成，继续监听…"
            : "无可执行 Story，等待…"
        );
        await sleep(sleepMs);
        continue;
      }

      waitStatusLine.clear();
      const iterLabel = untilStop ? `${i} (∞)` : `${i} / ${maxIterations}`;
      console.error("");
      console.error("===============================================================");
      console.error(` Loop 迭代 ${iterLabel} (${tool})`);
      console.error("===============================================================");

      const result = await runWorkerIteration(db, projectRoot, projectName, {
        workerId: "w0",
        story: currentStory,
        iteration: i,
        tool,
        promptPath,
        baseBranch: db.getProjectMeta(projectName).branchName,
        useWorktree: false,
      });

      const runState = readLoopRunState(projectRoot);
      if (runState) {
        writeLoopRunState(projectRoot, {
          ...runState,
          iteration: i,
          currentStoryId: currentStory.id,
        });
      }

      if (result.completed) {
        if (!untilStop) {
          console.error("");
          console.error(`Loop 完成！（第 ${i} 轮）`);
          return finish({
            completed: true,
            iterations: i,
            maxIterations,
            untilStop,
            tool,
            workers: 1,
            reason: "agent 返回 COMPLETE 或全部 Story 已完成",
          });
        }
        waitStatusLine.write("所有 Story 已完成，继续监听…");
        clearLoopRunCurrentStory(projectRoot);
        await sleep(sleepMs);
        continue;
      }

      waitStatusLine.clear();
      console.error(`第 ${i} 轮结束，继续下一轮…`);
      clearLoopRunCurrentStory(projectRoot);
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
      workers: 1,
      reason: `已达最大迭代次数 (${maxIterations})`,
    });
  } catch (err) {
    patchRunLivePhase(projectRoot, "done");
    clearLoopRunState(projectRoot);
    throw err;
  }
}

export async function runLoop(
  db: LoopStateDb,
  projectRoot: string,
  options: LoopRunOptions = {}
): Promise<LoopRunResult> {
  const untilStop = options.untilStop === true;
  const maxIterations = untilStop ? null : (options.maxIterations ?? 10);
  const sleepMs = options.sleepMs ?? 2000;
  const workers = Math.max(1, Math.min(8, options.workers ?? 1));
  const tool = resolveTool(options.tool);
  const projectName = getProjectName(db, options.projectName);
  const promptPath = resolvePromptPath(projectRoot);

  if (!existsSync(promptPath)) {
    throw new Error(`找不到 Agent 提示词: ${promptPath}`);
  }

  maybeArchivePreviousRun(projectRoot, db, projectName);
  releaseAllClaims(db, projectName);

  const status = db.getStatus(projectName);
  if (status.isComplete && !untilStop) {
    return {
      completed: true,
      iterations: 0,
      maxIterations,
      untilStop,
      tool,
      workers,
      reason: "所有 Story 已完成",
    };
  }

  const common = {
    untilStop,
    maxIterations,
    sleepMs,
    tool,
    projectName,
    promptPath,
  };

  if (workers > 1) {
    return runParallelLoop(db, projectRoot, { ...common, workers });
  }
  return runSequentialLoop(db, projectRoot, common);
}

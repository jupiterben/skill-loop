import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPackageRoot } from "./config.js";
import {
  getLoopRunStatus,
  isPidAlive,
  readLoopRunState,
} from "./run-process.js";

export type StartLoopRunOptions = {
  tool?: string;
  untilStop?: boolean;
  maxIterations?: number;
  workers?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function quotePsSingle(value: string): string {
  return value.replace(/'/g, "''");
}

async function spawnLoopRunChild(
  packageRoot: string,
  entry: string,
  cliArgs: string[],
  env: NodeJS.ProcessEnv
): Promise<void> {
  const node = process.execPath;
  const tsx = join(packageRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const argList = [tsx, entry, ...cliArgs].map(quotePsSingle);

  if (process.platform === "win32") {
    const scriptPath = join(
      tmpdir(),
      `loop-run-${randomBytes(4).toString("hex")}.ps1`
    );
    const lines = [
      `$env:LOOP_PROJECT_ROOT = '${quotePsSingle(String(env.LOOP_PROJECT_ROOT ?? ""))}'`,
      `Start-Process -FilePath '${quotePsSingle(node)}' ` +
        `-ArgumentList @(${argList.map((a) => `'${a}'`).join(",")}) ` +
        `-WorkingDirectory '${quotePsSingle(packageRoot)}' ` +
        `-WindowStyle Hidden | Out-Null`,
    ];
    writeFileSync(scriptPath, lines.join("\n"), "utf8");

    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-WindowStyle",
          "Hidden",
          "-File",
          scriptPath,
        ],
        { stdio: "ignore", windowsHide: true, env }
      );
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`外循环启动脚本失败 (exit ${code ?? "unknown"})`));
      });
    });

    try {
      unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
    return;
  }

  const child = spawn(node, [tsx, entry, ...cliArgs], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env,
    cwd: packageRoot,
  });
  child.unref();
}

async function waitForLoopRunStart(
  projectRoot: string,
  timeoutMs = 12_000
): Promise<ReturnType<typeof getLoopRunStatus>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = getLoopRunStatus(projectRoot);
    if (status.running) return status;
    await sleep(120);
  }
  const state = readLoopRunState(projectRoot);
  if (state && isPidAlive(state.pid)) {
    return getLoopRunStatus(projectRoot);
  }
  return getLoopRunStatus(projectRoot);
}

export async function startLoopRunBackground(
  projectRoot: string,
  options: StartLoopRunOptions = {}
): Promise<{
  ok: boolean;
  message: string;
  status: ReturnType<typeof getLoopRunStatus>;
}> {
  const current = getLoopRunStatus(projectRoot);
  if (current.running) {
    return {
      ok: false,
      message: "外循环已在运行",
      status: current,
    };
  }

  const untilStop = options.untilStop !== false;
  const toolHint =
    options.tool?.trim() || process.env.LOOP_RUN_TOOL?.trim() || undefined;

  const { resolveRunTool } = await import("./loop-run.js");
  const resolvedTool = resolveRunTool(toolHint);

  const workers = Math.max(1, Math.min(8, options.workers ?? 1));
  const cliArgs = ["run"];
  if (untilStop) {
    cliArgs.push("--until-stop");
  } else {
    const max = options.maxIterations ?? 10;
    if (!Number.isFinite(max) || max < 1) {
      throw new Error("maxIterations 须为正整数");
    }
    cliArgs.push(String(max));
  }
  cliArgs.push("--tool", resolvedTool);
  if (workers > 1) {
    cliArgs.push("--workers", String(workers));
  }

  const packageRoot = getPackageRoot();
  const entry = join(packageRoot, "src", "cli.ts");
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    LOOP_PROJECT_ROOT: projectRoot,
  };

  await spawnLoopRunChild(packageRoot, entry, cliArgs, childEnv);

  const status = await waitForLoopRunStart(projectRoot);
  if (!status.running) {
    throw new Error(
      "外循环启动失败：子进程未就绪。请确认 agent/claude 等工具已安装，或在终端执行 loop run status 查看详情"
    );
  }

  const tool = status.state?.tool ?? status.coordinator?.tool ?? resolvedTool;
  const workerLabel =
    workers > 1 ? `${workers} workers · ` : "";
  return {
    ok: true,
    message: untilStop
      ? `外循环已启动（${workerLabel}${tool}，持续运行）`
      : `外循环已启动（${workerLabel}${tool}）`,
    status,
  };
}

#!/usr/bin/env node
/**
 * loop-cli CLI — 对齐 MCP 常用命令，供 Agent 通过 Shell 调用（无需 MCP）。
 *
 * LOOP_PROJECT_ROOT=... loop-cli status
 * LOOP_PROJECT_ROOT=... loop-cli complete US-001
 */
import { LoopStateDb } from "./db.js";
import { getProjectName } from "./get-project-name.js";
import {
  flagNum,
  flagStr,
  parseCliArgs,
  repeatValues,
  type ParsedCli,
} from "./cli-args.js";
import { getProjectRoot } from "./paths.js";
import { runLoop } from "./loop-run.js";
import {
  getLoopRunStatus,
  requestLoopRunStop,
} from "./run-process.js";
import {
  getAllRunLiveForDashboard,
  readRunLive,
} from "./run-live.js";

function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function projectName(db: LoopStateDb, parsed: ParsedCli): string {
  return getProjectName(db, flagStr(parsed.flags, "project"));
}

type Handler = (db: LoopStateDb, projectRoot: string, parsed: ParsedCli) => unknown;

const COMMANDS: Record<string, Handler> = {
  status(db, _root, parsed) {
    return db.getStatus(projectName(db, parsed));
  },

  prd(db, _root, parsed) {
    const name = projectName(db, parsed);
    return {
      ...db.getProjectMeta(name),
      milestones: db.getMilestones(name),
      features: db.getFeatures(name),
      userStories: db.getStories(name),
      tree: db.getTree(name),
    };
  },

  tree(db, _root, parsed) {
    return { tree: db.getTree(projectName(db, parsed)) };
  },

  next(db, _root, parsed) {
    const name = projectName(db, parsed);
    const next = db.getNextStory(name);
    if (next) return next;
    const hasDraft = db.getActiveStories(name).some(
      (s) => !s.passes && s.status === "draft"
    );
    if (hasDraft) {
      return { message: "有草稿 Story 待确认（confirm-story）", story: null };
    }
    return { message: "所有 Story 已完成", story: null };
  },

  patterns(db, _root, parsed) {
    return db.getPatterns(projectName(db, parsed));
  },

  init(db, _root, parsed) {
    const project = flagStr(parsed.flags, "project");
    if (!project) fail("缺少 --project");
    const branchName = flagStr(parsed.flags, "branch", "branch-name") ?? "main";
    const description = flagStr(parsed.flags, "description", "desc") ?? "";
    db.upsertProject({ name: project, branchName, description });
    return { ok: true, project, branchName, description };
  },

  complete(db, _root, parsed) {
    const storyId = parsed.positional[0] ?? flagStr(parsed.flags, "story-id", "id");
    if (!storyId) fail("用法: loop-cli complete US-001");
    const workerId =
      flagStr(parsed.flags, "worker-id", "worker") ??
      process.env.LOOP_WORKER_ID?.trim();
    return db.completeStory(projectName(db, parsed), storyId, workerId);
  },

  "claim-story"(db, _root, parsed) {
    const storyId = parsed.positional[0] ?? flagStr(parsed.flags, "story-id", "id");
    const workerId =
      flagStr(parsed.flags, "worker-id", "worker") ??
      process.env.LOOP_WORKER_ID?.trim();
    if (!storyId || !workerId) {
      fail("用法: loop-cli claim-story US-001 --worker-id w0");
    }
    return db.claimStory(projectName(db, parsed), storyId, workerId);
  },

  "release-claim"(db, _root, parsed) {
    const storyId = parsed.positional[0] ?? flagStr(parsed.flags, "story-id", "id");
    if (!storyId) fail("用法: loop-cli release-claim US-001 [--worker-id w0]");
    const workerId =
      flagStr(parsed.flags, "worker-id", "worker") ??
      process.env.LOOP_WORKER_ID?.trim();
    return db.releaseClaim(projectName(db, parsed), storyId, workerId);
  },

  "next-stories"(db, _root, parsed) {
    const limit = flagNum(parsed.flags, "limit") ?? 3;
    return db.getNextStories(projectName(db, parsed), limit);
  },

  "confirm-story"(db, _root, parsed) {
    const storyId = parsed.positional[0] ?? flagStr(parsed.flags, "story-id", "id");
    if (!storyId) fail("用法: loop-cli confirm-story US-001");
    return db.confirmStory(projectName(db, parsed), storyId);
  },

  "unconfirm-story"(db, _root, parsed) {
    const storyId = parsed.positional[0] ?? flagStr(parsed.flags, "story-id", "id");
    if (!storyId) fail("用法: loop-cli unconfirm-story US-001");
    return db.unconfirmStory(projectName(db, parsed), storyId);
  },

  "add-story"(db, _root, parsed) {
    const title = flagStr(parsed.flags, "title");
    if (!title) fail("缺少 --title");
    const name = projectName(db, parsed);
    const ready = parsed.flags.ready === true;
    return db.addStory(name, {
      parentId: flagStr(parsed.flags, "parent-id") ?? null,
      milestoneId: flagStr(parsed.flags, "milestone-id") ?? null,
      dependsOn: repeatValues(parsed.repeats, "depends-on"),
      title,
      description:
        flagStr(parsed.flags, "description", "desc") ?? `作为用户，我需要：${title}`,
      acceptanceCriteria: repeatValues(parsed.repeats, "ac", "acceptance-criteria").length
        ? repeatValues(parsed.repeats, "ac", "acceptance-criteria")
        : ["实现功能", "npm test 通过"],
      priority: flagNum(parsed.flags, "priority") ?? 0,
      notes: flagStr(parsed.flags, "notes") ?? "",
      status: ready ? "ready" : "draft",
    });
  },

  "add-feature"(db, _root, parsed) {
    const title = flagStr(parsed.flags, "title");
    if (!title) fail("缺少 --title");
    return db.addFeature(projectName(db, parsed), {
      parentId: flagStr(parsed.flags, "parent-id") ?? null,
      title,
      description: flagStr(parsed.flags, "description", "desc") ?? "",
    });
  },

  bug(db, _root, parsed) {
    const storyId =
      parsed.positional[0] ?? flagStr(parsed.flags, "story-id", "id");
    const description =
      parsed.positional.slice(1).join(" ").trim() ||
      flagStr(parsed.flags, "description", "desc", "message") ||
      "";
    if (!storyId) {
      fail(
        '用法: loop bug <US-xxx> "缺陷描述" [--ready] [--title "修复标题"] [--change-note "..."]'
      );
    }
    if (!description) fail("缺少缺陷描述");
    return db.reportBug(projectName(db, parsed), storyId, description, {
      ready: parsed.flags.ready === true,
      changeNote: flagStr(parsed.flags, "change-note", "note"),
      fixTitle: flagStr(parsed.flags, "title"),
    });
  },

  "update-feature"(db, _root, parsed) {
    const featureId =
      parsed.positional[0] ?? flagStr(parsed.flags, "feature-id", "id");
    if (!featureId) fail("用法: loop-cli update-feature FT-001 [--title \"...\"]");
    const patch: { title?: string; description?: string } = {};
    const title = flagStr(parsed.flags, "title");
    const description = flagStr(parsed.flags, "description", "desc");
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;
    if (!Object.keys(patch).length) fail("至少提供 --title 或 --description");
    return db.updateFeature(projectName(db, parsed), featureId, patch);
  },

  "update-story"(db, _root, parsed) {
    const storyId =
      parsed.positional[0] ?? flagStr(parsed.flags, "story-id", "id");
    if (!storyId) fail("用法: loop-cli update-story US-001 [--title \"...\"] --status draft|ready");
    const status = flagStr(parsed.flags, "status");
    if (!status || (status !== "draft" && status !== "ready")) {
      fail("缺少或无效 --status（draft | ready）");
    }
    const patch: {
      title?: string;
      description?: string;
      acceptanceCriteria?: string[];
      changeNote?: string;
      status: "draft" | "ready";
    } = { status };
    const title = flagStr(parsed.flags, "title");
    const description = flagStr(parsed.flags, "description", "desc");
    const changeNote = flagStr(parsed.flags, "change-note", "note");
    const ac = repeatValues(parsed.repeats, "ac", "acceptance-criteria");
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;
    if (changeNote !== undefined) patch.changeNote = changeNote;
    if (ac.length) patch.acceptanceCriteria = ac;
    if (
      patch.title === undefined &&
      patch.description === undefined &&
      !patch.acceptanceCriteria?.length
    ) {
      fail("至少提供 --title、--description 或 --ac");
    }
    return db.updateStory(projectName(db, parsed), storyId, patch);
  },

  "move-story"(db, _root, parsed) {
    const storyId =
      parsed.positional[0] ?? flagStr(parsed.flags, "story-id", "id");
    if (!storyId) fail("用法: loop-cli move-story US-001 --parent-id FT-004");
    const parentId = flagStr(parsed.flags, "parent-id");
    if (!parentId) fail("缺少 --parent-id");
    return db.moveStory(projectName(db, parsed), storyId, parentId);
  },

  "delete-story"(db, _root, parsed) {
    const storyId =
      parsed.positional[0] ?? flagStr(parsed.flags, "story-id", "id");
    if (!storyId) fail("用法: loop-cli delete-story US-001");
    db.deleteStory(projectName(db, parsed), storyId);
    return { ok: true, deleted: storyId };
  },

  "add-milestone"(db, _root, parsed) {
    const title = flagStr(parsed.flags, "title");
    if (!title) fail("缺少 --title");
    return db.addMilestone(projectName(db, parsed), {
      title,
      description: flagStr(parsed.flags, "description", "desc") ?? "",
    });
  },

  "update-milestone"(db, _root, parsed) {
    const milestoneId =
      parsed.positional[0] ?? flagStr(parsed.flags, "milestone-id", "id");
    if (!milestoneId) fail("用法: loop-cli update-milestone MS-001 [--title \"...\"]");
    const patch: { title?: string; description?: string } = {};
    const title = flagStr(parsed.flags, "title");
    const description = flagStr(parsed.flags, "description", "desc");
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;
    if (!Object.keys(patch).length) fail("至少提供 --title 或 --description");
    return db.updateMilestone(projectName(db, parsed), milestoneId, patch);
  },

  progress(db, _root, parsed) {
    const summary = flagStr(parsed.flags, "summary");
    if (!summary) fail("缺少 --summary");
    return db.appendProgress(projectName(db, parsed), {
      storyId: flagStr(parsed.flags, "story-id") ?? null,
      entryDate:
        flagStr(parsed.flags, "date", "entry-date") ??
        new Date().toISOString().slice(0, 10),
      summary,
      learnings: repeatValues(parsed.repeats, "learning", "learnings"),
    });
  },

  "add-pattern"(db, _root, parsed) {
    const content =
      flagStr(parsed.flags, "content") ?? parsed.positional.join(" ");
    if (!content) fail("用法: loop-cli add-pattern \"模式描述\"");
    const name = projectName(db, parsed);
    db.addPattern(name, content);
    return { ok: true, patterns: db.getPatterns(name) };
  },

  "update-pattern"(db, _root, parsed) {
    const index = flagNum(parsed.flags, "index");
    if (index === undefined || index < 0 || !Number.isInteger(index)) {
      fail("用法: loop-cli update-pattern --index 0 \"新模式描述\"");
    }
    const content =
      flagStr(parsed.flags, "content") ?? parsed.positional.join(" ");
    if (!content) fail("用法: loop-cli update-pattern --index 0 \"新模式描述\"");
    const name = projectName(db, parsed);
    db.updatePattern(name, index, content);
    return { ok: true, patterns: db.getPatterns(name) };
  },

  "delete-pattern"(db, _root, parsed) {
    const index =
      flagNum(parsed.flags, "index") ??
      (parsed.positional[0] !== undefined
        ? Number(parsed.positional[0])
        : undefined);
    if (index === undefined || index < 0 || !Number.isInteger(index)) {
      fail("用法: loop-cli delete-pattern --index 0");
    }
    const name = projectName(db, parsed);
    db.deletePattern(name, index);
    return { ok: true, patterns: db.getPatterns(name) };
  },

  "start-run"(db, _root, parsed) {
    const iteration = flagNum(parsed.flags, "iteration");
    if (!iteration || iteration < 1) fail("缺少 --iteration（正整数）");
    return db.startRun(
      projectName(db, parsed),
      iteration,
      flagStr(parsed.flags, "tool") ?? null
    );
  },

  "end-run"(db, _root, parsed) {
    const runId = flagNum(parsed.flags, "run-id");
    const status = flagStr(parsed.flags, "status");
    if (!runId || runId < 1) fail("缺少 --run-id");
    if (!status || !["completed", "failed", "max_iterations"].includes(status)) {
      fail("缺少或无效 --status（completed | failed | max_iterations）");
    }
    return db.endRun(
      runId,
      status as "completed" | "failed" | "max_iterations",
      flagStr(parsed.flags, "message")
    );
  },

  "request-removal"(db, _root, parsed) {
    const storyId = parsed.positional[0] ?? flagStr(parsed.flags, "story-id");
    if (!storyId) fail("用法: loop-cli request-removal US-001");
    return db.requestStoryRemoval(
      projectName(db, parsed),
      storyId,
      flagStr(parsed.flags, "reason")
    );
  },

  archive(db, _root, parsed) {
    const storyId = parsed.positional[0] ?? flagStr(parsed.flags, "story-id");
    if (!storyId) fail("用法: loop-cli archive US-001");
    return db.archiveStory(
      projectName(db, parsed),
      storyId,
      flagStr(parsed.flags, "reason")
    );
  },

  restore(db, _root, parsed) {
    const storyId = parsed.positional[0] ?? flagStr(parsed.flags, "story-id");
    if (!storyId) fail("用法: loop-cli restore US-001");
    return db.restoreStory(projectName(db, parsed), storyId);
  },
};

const ALIASES: Record<string, string> = {
  ls: "status",
  "get-status": "status",
  "get-next-story": "next",
  "get-patterns": "patterns",
  "get-prd": "prd",
  "get-tree": "tree",
  "complete-story": "complete",
  "approve-story": "confirm-story",
  "confirm": "confirm-story",
  "revert-story": "unconfirm-story",
  "unconfirm": "unconfirm-story",
  "append-progress": "progress",
  "update-milestone": "update-milestone",
};

function printHelp(): void {
  console.log(`loop-cli — Loop 工程迭代状态 CLI（通过 Shell 调用，无需 MCP）

环境变量:
  LOOP_PROJECT_ROOT   项目根目录（状态在 loop-data/）

用法:
  loop-cli <command> [options]

查询:
  status [--project NAME]              总览进度
  next                                 下一待做 Story
  patterns                             Codebase Patterns
  prd | tree                           完整 PRD / 脑图树

写入:
  complete <US-xxx>                    标记 Story 完成
  confirm-story <US-xxx>               确认草稿 Story 为可执行
  unconfirm-story <US-xxx>             未开发的 Story 退回草稿
  progress --summary "..." [--story-id US-xxx] [--learning "..."]
  add-pattern "可复用模式"
  update-pattern --index 0 "更新后的模式"
  delete-pattern --index 0
  add-story --title "..." [--ready] [--parent-id FT-001] [--depends-on US-001] [--ac "..."]
  bug <US-xxx> "缺陷描述" [--ready] [--title "修复标题"] [--change-note "..."]
  add-feature --title "..." [--parent-id FT-001]
  update-story <US-xxx> [--title "..."] [--description "..."] [--ac "..."] --status draft|ready [--change-note "..."]
  update-feature <FT-xxx> [--title "..."] [--description "..."]
  move-story <US-xxx> --parent-id FT-004
  delete-story <US-xxx>
  add-milestone --title "..."
  update-milestone <MS-xxx> [--title "..."] [--description "..."]

循环:
  run [--tool agent|claude|amp] [--max-iterations 10] [--workers N] [N]
                      外循环（默认最多 10 轮，workers 默认 1）
  run --until-stop [--tool agent] [--workers 3]
                      持续外循环，直到 loop run stop
  run stop [--worker w0]              请求停止外循环（或单个 worker）
  run status                          查看外循环运行状态
  run output [--worker w0] [--text]   读取当前 Agent live 输出
  next-stories [--limit 3]            查看可并行执行的 Story 列表
  claim-story <US-xxx> --worker-id w0 认领 Story（并行模式）
  release-claim <US-xxx> [--worker-id w0]

规划:
  plan [--tool agent] [--story-id US-xxx] [--requirement "..."]
                      需求拆分 Agent（单次，使用 templates/PLANNER.md）

迭代记账:
  start-run --iteration 1 [--tool cursor]
  end-run --run-id 1 --status completed [--message "..."]

其他:
  init --project NAME [--branch main] [--description "..."]
  request-removal <US-xxx> [--reason "..."]
  archive <US-xxx> | restore <US-xxx>
  dashboard [start] [--port 3460] [--no-open]   后台启动看板
  dashboard stop | stop-dashboard                 关闭看板
  dashboard status                                查看看板状态

示例（PowerShell）:
  $env:LOOP_PROJECT_ROOT = (Get-Location).Path
  pnpm loop status
  pnpm loop next
  pnpm loop complete US-003
  pnpm loop bug US-001 "拖拽后节点弹回原位"
  pnpm loop progress --story-id US-003 --summary "实现登录页"
  pnpm loop run --tool agent 10
  pnpm loop run --until-stop --tool agent
  pnpm loop run --workers 3 --until-stop --tool agent
  pnpm loop run stop
`);
}

async function handleRunCommand(
  db: LoopStateDb,
  projectRoot: string,
  parsed: ParsedCli
): Promise<void> {
  const sub = parsed.positional[0]?.toLowerCase();

  if (sub === "stop") {
    const workerId = flagStr(parsed.flags, "worker");
    output(requestLoopRunStop(projectRoot, workerId));
    return;
  }

  if (sub === "status") {
    output(getLoopRunStatus(projectRoot));
    return;
  }

  if (sub === "output") {
    const workerId = flagStr(parsed.flags, "worker-id", "worker");
    const textOnly = parsed.flags.text === true;

    if (workerId) {
      const live = readRunLive(projectRoot, workerId);
      if (!live) fail(`无 live 输出（worker: ${workerId}）`);
      if (textOnly) {
        process.stdout.write(live.output);
        return;
      }
      output(live);
      return;
    }

    const workers = getAllRunLiveForDashboard(projectRoot);
    if (!workers.length) {
      if (textOnly) return;
      output({ message: "外循环未运行或尚无 live 输出", workers: [] });
      return;
    }

    if (textOnly) {
      if (workers.length === 1) {
        process.stdout.write(workers[0]!.output);
        return;
      }
      for (const w of workers) {
        const label = w.workerId ?? w.storyId ?? String(w.iteration);
        process.stdout.write(`\n=== ${label} ===\n${w.output}`);
      }
      return;
    }

    output({ workers });
    return;
  }

  const untilStop =
    parsed.flags["until-stop"] === true || parsed.flags.forever === true;

  if (sub && !untilStop && !/^\d+$/.test(sub)) {
    fail(`未知 run 子命令: ${sub}（支持 stop | status | output）`);
  }

  const maxFromFlag =
    flagNum(parsed.flags, "max-iterations") ?? flagNum(parsed.flags, "max");
  const maxFromPos =
    sub && /^\d+$/.test(sub) ? Number(sub) : undefined;

  if (!untilStop) {
    const maxIterations = maxFromFlag ?? maxFromPos ?? 10;
    if (!Number.isFinite(maxIterations) || maxIterations < 1) {
      fail("max-iterations 须为正整数");
    }

    const result = await runLoop(db, projectRoot, {
      tool: flagStr(parsed.flags, "tool"),
      maxIterations,
      projectName: flagStr(parsed.flags, "project"),
      workers: flagNum(parsed.flags, "workers"),
    });

    output(result);
    if (!result.completed) process.exit(1);
    return;
  }

  if (maxFromFlag != null || maxFromPos != null) {
    fail("--until-stop 不能与 max-iterations 或轮数参数同时使用");
  }

  const result = await runLoop(db, projectRoot, {
    tool: flagStr(parsed.flags, "tool"),
    untilStop: true,
    projectName: flagStr(parsed.flags, "project"),
    workers: flagNum(parsed.flags, "workers"),
  });

  output(result);
  if (!result.completed) process.exit(1);
}

async function handleDashboardCommand(
  projectRoot: string,
  sub: string,
  parsed: ParsedCli
): Promise<void> {
  const port =
    flagNum(parsed.flags, "port") ??
    Number(process.env.LOOP_DASHBOARD_PORT ?? 3460);
  const open = parsed.flags.open !== false && parsed.flags["no-open"] !== true;

  if (sub === "stop" || sub === "close") {
    const { stopDashboard } = await import("./dashboard-process.js");
    output(await stopDashboard(projectRoot));
    return;
  }

  if (sub === "status") {
    const { getDashboardStatus } = await import("./dashboard-process.js");
    output(getDashboardStatus(projectRoot));
    return;
  }

  if (parsed.flags.foreground === true) {
    const { startDashboardServer } = await import("./server.js");
    const result = await startDashboardServer({
      port,
      openBrowser: open,
      projectRoot,
    });
    if (!result.started) {
      output({ url: result.url, started: false, message: "Dashboard 已在运行" });
      return;
    }
    console.error(`Dashboard: ${result.url}（前台运行，Ctrl+C 关闭）`);
    return;
  }

  const { startDashboardBackground } = await import("./dashboard-process.js");
  output(await startDashboardBackground(projectRoot, { port, open }));
}

const DASHBOARD_START = new Set(["dashboard", "start-dashboard"]);
const DASHBOARD_STOP = new Set([
  "stop-dashboard",
  "dashboard-stop",
  "close-dashboard",
]);

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (!parsed.command || parsed.flags.help === true || parsed.command === "help") {
    printHelp();
    process.exit(parsed.command ? 0 : 1);
  }

  const command = ALIASES[parsed.command] ?? parsed.command;

  if (command === "run") {
    const projectRoot = getProjectRoot();
    const db = new LoopStateDb(projectRoot);
    try {
      await handleRunCommand(db, projectRoot, parsed);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    } finally {
      db.close();
    }
    return;
  }

  if (command === "plan") {
    const projectRoot = getProjectRoot();
    const db = new LoopStateDb(projectRoot);
    try {
      const { runPlan } = await import("./loop-plan.js");
      output(
        await runPlan(db, projectRoot, {
          tool: flagStr(parsed.flags, "tool"),
          storyId:
            flagStr(parsed.flags, "story-id", "id") ?? parsed.positional[0],
          requirement: flagStr(parsed.flags, "requirement", "req"),
          projectName: flagStr(parsed.flags, "project"),
        })
      );
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    } finally {
      db.close();
    }
    return;
  }

  if (DASHBOARD_START.has(command) || DASHBOARD_STOP.has(command)) {
    try {
      const projectRoot = getProjectRoot();
      const sub = DASHBOARD_STOP.has(command)
        ? "stop"
        : (parsed.positional[0] ?? "start");
      await handleDashboardCommand(projectRoot, sub, parsed);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) fail(`未知命令: ${parsed.command}（loop-cli help 查看帮助）`);

  const projectRoot = getProjectRoot();
  const db = new LoopStateDb(projectRoot);

  try {
    output(handler(db, projectRoot, parsed));
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    db.close();
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});

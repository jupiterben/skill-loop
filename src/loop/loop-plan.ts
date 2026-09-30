import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LoopStateDb } from "../db/db.js";
import { getPackageRoot } from "../infra/config.js";
import { invokeAgentProcess } from "./agent-invoke.js";
import { selectAgent } from "../domain/agent-config.js";
import { getProjectName } from "../db/get-project-name.js";
import { getStateDir } from "../infra/paths.js";
import { resolveRunTool } from "./loop-run.js";

export type PlanOptions = {
  tool?: string;
  agentProfileId?: string;
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
  agentProfileId?: string | null;
  model?: string | null;
};

export function resolvePlannerPromptPath(projectRoot: string): string {
  const custom = process.env.LOOP_PLANNER_PROMPT?.trim();
  if (custom && existsSync(custom)) return custom;

  const inProject = join(getStateDir(projectRoot), "PLANNER.md");
  if (existsSync(inProject)) return inProject;

  return join(getPackageRoot(), "templates", "PLANNER.md");
}

export function buildPlannerPrompt(
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

export async function runPlan(
  db: LoopStateDb,
  projectRoot: string,
  options: PlanOptions = {}
): Promise<PlanResult> {
  const projectName = getProjectName(db, options.projectName);
  const selectedAgent = selectAgent(db.getAgentConfig(projectName), options);
  const tool = resolveRunTool(selectedAgent.tool);
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

  const prompt = buildPlannerPrompt(promptPath, {
    storyId: storyId ?? undefined,
    requirement: options.requirement?.trim(),
  });

  console.error(`Loop Planner — 工具: ${tool}`);
  console.error(`提示词: ${promptPath}`);
  console.error(`项目: ${projectName} @ ${projectRoot}`);
  if (storyId) console.error(`目标 Story: ${storyId}`);

  const output = await invokeAgentProcess(tool, prompt, {
    cwd: projectRoot,
    model: selectedAgent.profile?.model,
    onDisplay: (text) => {
      if (text.trim()) process.stdout.write(text);
    },
  });

  return {
    ok: true,
    tool,
    promptPath,
    storyId,
    output,
    agentProfileId: selectedAgent.profile?.id ?? null,
    model: selectedAgent.profile?.model ?? null,
  };
}

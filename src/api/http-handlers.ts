import type { IncomingMessage, ServerResponse } from "node:http";
import type { LoopStateDb } from "../db/db.js";
import { handleApiMutation } from "./api.js";
import { buildStoryDependencies } from "../domain/tree.js";
import { getLoopRunStatus } from "../loop/run-process.js";
import {
  getAllRunLiveForDashboard,
  getRunLiveForDashboard,
} from "../loop/run-live.js";
import { resolveProjectName, sendJson } from "./http-utils.js";
import { RUN_TOOLS, type RunTool } from "../domain/run-tool.js";
import { getAgentModels } from "../loop/agent-models.js";
import { getInstalledAgentTools } from "../infra/installed-tools.js";

export const API_VERSION = 8;

/** 处理 /api/* 读写请求；返回 true 表示已响应 */
export async function handleDashboardApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  db: LoopStateDb,
  projectRoot: string,
  pathname: string
): Promise<boolean> {
  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, { ok: true, projectRoot, apiVersion: API_VERSION });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/agent-models") {
    try {
      const tool = new URL(req.url ?? "", "http://localhost").searchParams.get("tool");
      if (!RUN_TOOLS.includes(tool as RunTool)) throw new Error("Invalid agent CLI");
      const config = db.getAgentConfig(resolveProjectName(db));
      sendJson(res, await getAgentModels(projectRoot, tool as RunTool, config.profiles));
    } catch (error) {
      sendJson(res, { error: error instanceof Error ? error.message : String(error) }, 400);
    }
    return true;
  }

  if (req.method === "GET" && pathname === "/api/dashboard") {
    try {
      const projectName = resolveProjectName(db);
      const status = db.getStatus(projectName);
      const allStories = db.getStories(projectName);
      const activeStories = db.getActiveStories(projectName);
      sendJson(res, {
        apiVersion: API_VERSION,
        projectName,
        projectRoot,
        agentConfig: db.getAgentConfig(projectName),
        installedAgentTools: await getInstalledAgentTools(),
        status,
        loopRunner: getLoopRunStatus(projectRoot),
        runLive: getRunLiveForDashboard(projectRoot),
        runLiveWorkers: getAllRunLiveForDashboard(projectRoot),
        milestones: db.getMilestones(projectName),
        features: db.getFeatures(projectName),
        userStories: activeStories,
        archivedStories: db.getArchivedStories(projectName),
        tree: db.getTree(projectName),
        dependencies: buildStoryDependencies(allStories),
        patterns: db.getPatterns(projectName),
        projectSpec: db.getProjectSpec(projectName),
        projectSpecTemplates: db.getProjectSpecTemplates(),
        progress: db.getProgress(projectName, 30),
        runs: db.getRuns(projectName, 20),
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, { error: message }, 404);
      return true;
    }
  }

  const handled = await handleApiMutation(req, res, db, projectRoot, pathname);
  if (handled) return true;

  return false;
}

export function respondApiNotFound(res: ServerResponse): void {
  sendJson(res, { error: "Not Found" }, 404);
}

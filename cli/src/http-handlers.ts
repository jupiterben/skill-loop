import type { IncomingMessage, ServerResponse } from "node:http";
import type { LoopStateDb } from "./db.js";
import { handleApiMutation } from "./api.js";
import { getProjectName } from "./get-project-name.js";
import { buildStoryDependencies } from "./tree.js";
import { getLoopRunStatus } from "./run-process.js";
import { getRunLiveForDashboard, getAllRunLiveForDashboard } from "./run-live.js";

export const API_VERSION = 8;

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function resolveProjectName(db: LoopStateDb): string {
  return getProjectName(db, process.env.LOOP_PROJECT_NAME?.trim());
}

/** 处理 /api/* 读写请求；返回 true 表示已响应 */
export async function handleDashboardApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  db: LoopStateDb,
  projectRoot: string,
  pathname: string
): Promise<boolean> {
  if (req.method === "GET" && pathname === "/api/health") {
    json(res, { ok: true, projectRoot, apiVersion: API_VERSION });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/dashboard") {
    try {
      const projectName = resolveProjectName(db);
      const status = db.getStatus(projectName);
      const allStories = db.getStories(projectName);
      const activeStories = db.getActiveStories(projectName);
      json(res, {
        apiVersion: API_VERSION,
        projectName,
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
      json(res, { error: message }, 404);
      return true;
    }
  }

  const handled = await handleApiMutation(req, res, db, projectRoot, pathname);
  if (handled) return true;

  return false;
}

export function respondApiNotFound(res: ServerResponse): void {
  json(res, { error: "Not Found" }, 404);
}

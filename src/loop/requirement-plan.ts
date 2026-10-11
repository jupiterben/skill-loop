import { join } from "node:path";
import type { LoopStateDb } from "../db/db.js";
import type { RequirementPlanJob } from "../domain/requirement-plan.js";
import { readJsonFile, withStateLock, writeJsonFile } from "../infra/json-fs.js";
import { getStatusDir } from "../infra/paths.js";
import { runPlan } from "./loop-plan.js";

type StoredJob = RequirementPlanJob & { pid: number };
const file = (root: string) => join(getStatusDir(root), "requirement-plan.json");

export function getRequirementPlan(root: string): RequirementPlanJob | null {
  const job = readJsonFile<StoredJob | null>(file(root), null);
  if (!job) return null;
  if (job.status === "running") {
    try { process.kill(job.pid, 0); }
    catch {
      job.status = "failed";
      job.error = "规划进程已退出；请先检查需求地图中已写入的 Story，再决定是否重新提交。";
      job.finishedAt = new Date().toISOString();
    }
  }
  const { pid: _pid, ...publicJob } = job;
  return publicJob;
}

export function startRequirementPlan(
  db: LoopStateDb, root: string, projectName: string,
  input: { id: string; requirement: string; agentProfileId?: string; tool?: string },
): RequirementPlanJob {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(input.id)) throw new Error("无效的需求请求 ID");
  const requirement = input.requirement.trim();
  if (!requirement || requirement.length > 12000) throw new Error("需求内容应为 1–12000 字符");
  return withStateLock(getStatusDir(root), () => {
    const previous = getRequirementPlan(root);
    if (previous?.id === input.id) return previous;
    if (previous?.status === "running") throw new Error("已有需求正在规划，请等待完成");
    const beforeStories = new Set(db.getStories(projectName).map((story) => story.id));
    const beforeFeatures = new Set(db.getFeatures(projectName).map((feature) => feature.id));
    const job: StoredJob = {
      id: input.id, requirement, status: "running", pid: process.pid,
      startedAt: new Date().toISOString(), finishedAt: null, output: "", error: null,
      stories: [], features: [],
    };
    writeJsonFile(file(root), job);
    // The HTTP request returns immediately; the persisted job can be polled after closing the dialog.
    void (async () => {
      let lastWrite = 0;
      try {
        const result = await runPlan(db, root, {
          projectName, requirement, newRequirement: true,
          agentProfileId: input.agentProfileId, tool: input.tool,
          onDisplay(text) {
            job.output = (job.output + text).slice(-24000);
            if (Date.now() - lastWrite > 500) {
              writeJsonFile(file(root), job);
              lastWrite = Date.now();
            }
          },
        });
        job.output = result.output.slice(-24000);
        job.status = "completed";
      } catch (error) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : String(error);
      } finally {
        const features = db.getFeatures(projectName);
        job.features = features.filter((feature) => !beforeFeatures.has(feature.id)).map(({ id, title }) => ({ id, title }));
        job.stories = db.getStories(projectName).filter((story) => !beforeStories.has(story.id))
          .map(({ id, title, parentId }) => ({
            id, title, parentId, featureTitle: features.find((feature) => feature.id === parentId)?.title ?? "未分组",
          }));
        job.finishedAt = new Date().toISOString();
        writeJsonFile(file(root), job);
      }
    })().catch((error) => console.error("Requirement planner persistence failed:", error));
    return getRequirementPlan(root)!;
  });
}

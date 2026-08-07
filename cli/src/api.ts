import type { IncomingMessage, ServerResponse } from "node:http";
import type { LoopStateDb } from "./db.js";
import {
  patchString,
  pickBoolean,
  pickEnum,
  pickInteger,
  pickNullableString,
  pickNumber,
  pickOptionalEnum,
  pickOptionalString,
  pickString,
  pickStringArray,
} from "./api-helpers.js";
import { getProjectName } from "./get-project-name.js";
import { finishRunLiveForStory } from "./run-live.js";
import { parseRequiredStoryWorkType } from "./story-work-type.js";

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

function resolveProjectName(db: LoopStateDb): string {
  return getProjectName(db, process.env.LOOP_PROJECT_NAME?.trim());
}

function requireId(body: Record<string, unknown>, key: string): string {
  const value = pickString(body, key, "").trim();
  if (!value) throw new Error(`${key} 必填`);
  return value;
}

export async function handleApiMutation(
  req: IncomingMessage,
  res: ServerResponse,
  db: LoopStateDb,
  projectRoot: string,
  pathname: string
): Promise<boolean> {
  if (req.method !== "POST" && req.method !== "DELETE" && req.method !== "PATCH") {
    return false;
  }

  try {
    const projectName = resolveProjectName(db);
    const body = await readJsonBody(req);

    if (req.method === "POST" && pathname === "/api/milestones") {
      const title = pickString(body, "title", "").trim();
      if (!title) throw new Error("title 必填");
      const milestone = db.addMilestone(projectName, {
        title,
        description: pickString(body, "description", ""),
        targetDate: pickOptionalString(body, "targetDate"),
        version: pickOptionalString(body, "version"),
      });
      json(res, { ok: true, milestone });
      return true;
    }

    if (
      (req.method === "PATCH" && pathname === "/api/milestones") ||
      (req.method === "POST" && pathname === "/api/milestones/update")
    ) {
      const id = requireId(body, "id");
      const patch: {
        title?: string;
        description?: string;
        targetDate?: string;
        version?: string;
      } = {};
      patchString(patch, body, "title", true);
      patchString(patch, body, "description");
      patchString(patch, body, "targetDate");
      patchString(patch, body, "version");
      const milestone = db.updateMilestone(projectName, id, patch);
      json(res, { ok: true, milestone });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/features") {
      const title = pickString(body, "title", "").trim();
      if (!title) throw new Error("title 必填");
      const feature = db.addFeature(projectName, {
        title,
        description: pickString(body, "description", ""),
        parentId: pickNullableString(body, "parentId"),
      });
      json(res, { ok: true, feature });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/features/update") {
      const id = requireId(body, "id");
      const patch: { title?: string; description?: string } = {};
      patchString(patch, body, "title");
      patchString(patch, body, "description");
      const feature = db.updateFeature(projectName, id, patch);
      json(res, { ok: true, feature });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/features/delete") {
      const id = requireId(body, "id");
      const deletedIds = db.deleteFeature(projectName, id);
      json(res, { ok: true, deletedIds });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/mindmap/reorder") {
      const id = requireId(body, "id");
      const kind = pickEnum(body, "kind", ["feature", "story"] as const);
      const direction = pickEnum(body, "direction", ["up", "down"] as const);
      if (kind === "feature") {
        const feature = db.reorderFeature(projectName, id, direction);
        json(res, { ok: true, feature });
      } else {
        const story = db.reorderStory(projectName, id, direction);
        json(res, { ok: true, story });
      }
      return true;
    }

    if (req.method === "POST" && pathname === "/api/mindmap/move") {
      const id = requireId(body, "id");
      const kind = pickEnum(body, "kind", ["feature", "story"] as const);
      const parentId = pickNullableString(body, "parentId");
      const result = db.moveMindMapItem(projectName, { id, kind, parentId });
      json(res, { ok: true, ...(kind === "feature" ? { feature: result } : { story: result }) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories") {
      const title = pickString(body, "title", "").trim();
      if (!title) throw new Error("title 必填");
      const workType = parseRequiredStoryWorkType(body.workType);
      const story = db.addStory(projectName, {
        title,
        description: pickString(body, "description", `作为用户，我需要：${title}`),
        workType,
        milestoneId: pickNullableString(body, "milestoneId"),
        parentId: pickNullableString(body, "parentId"),
        dependsOn: pickStringArray(body, "dependsOn"),
        acceptanceCriteria: pickStringArray(body, "acceptanceCriteria", [
          "实现功能",
          "npm test 通过",
        ]),
        priority: pickInteger(body, "priority", 0),
        notes: "",
      });
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/confirm") {
      const storyId = requireId(body, "storyId");
      const story = db.confirmStory(projectName, storyId);
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/unconfirm") {
      const storyId = requireId(body, "storyId");
      const story = db.unconfirmStory(projectName, storyId);
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/delete") {
      const storyId = requireId(body, "storyId");
      db.deleteStory(projectName, storyId);
      json(res, { ok: true });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/request-removal") {
      const storyId = requireId(body, "storyId");
      const result = db.requestStoryRemoval(
        projectName,
        storyId,
        pickOptionalString(body, "reason")
      );
      json(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/cancel-removal") {
      const storyId = requireId(body, "storyId");
      const result = db.cancelStoryRemoval(projectName, storyId);
      json(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/archive") {
      const storyId = requireId(body, "storyId");
      const result = db.archiveStory(
        projectName,
        storyId,
        pickOptionalString(body, "reason")
      );
      json(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/restore") {
      const storyId = requireId(body, "storyId");
      const result = db.restoreStory(projectName, storyId);
      json(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/purge") {
      const storyId = requireId(body, "storyId");
      db.purgeStory(projectName, storyId);
      json(res, { ok: true });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/dependencies") {
      const from = requireId(body, "from");
      const to = requireId(body, "to");
      const story = db.addStoryDependency(projectName, from, to);
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "DELETE" && pathname === "/api/dependencies") {
      const from = requireId(body, "from");
      const to = requireId(body, "to");
      const story = db.removeStoryDependency(projectName, from, to);
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/milestone") {
      const storyId = requireId(body, "storyId");
      const story = db.setStoryMilestone(
        projectName,
        storyId,
        pickNullableString(body, "milestoneId")
      );
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/priority") {
      const storyId = requireId(body, "storyId");
      const priority = pickInteger(body, "priority");
      const story = db.setStoryPriority(projectName, storyId, priority);
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/preferred-tool") {
      const storyId = requireId(body, "storyId");
      const story = db.setStoryPreferredTool(
        projectName,
        storyId,
        pickNullableString(body, "preferredTool") as import("./types.js").PreferredTool | null
      );
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/update") {
      const storyId = requireId(body, "storyId");
      const patch: {
        title?: string;
        description?: string;
        workType?: import("./types.js").StoryWorkType;
        acceptanceCriteria?: string[];
        changeNote?: string;
        status?: "draft" | "ready";
      } = {};
      patchString(patch, body, "title");
      patchString(patch, body, "description");
      const workType = pickOptionalEnum(body, "workType", [
        "implementation",
        "documentation",
        "planning",
        "testing",
        "refactor",
      ] as const);
      if (workType !== undefined) patch.workType = workType;
      if (body.acceptanceCriteria !== undefined) {
        patch.acceptanceCriteria = pickStringArray(body, "acceptanceCriteria");
      }
      patchString(patch, body, "changeNote");
      const status = pickOptionalEnum(body, "status", ["draft", "ready"] as const);
      if (status !== undefined) patch.status = status;
      const result = db.updateStory(projectName, storyId, patch);
      json(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/complete") {
      const storyId = requireId(body, "storyId");
      const result = db.completeStoryWithProgress(projectName, storyId, {
        summary: pickString(body, "summary", ""),
        learnings: body.learnings !== undefined ? pickStringArray(body, "learnings") : undefined,
        workerId:
          pickOptionalString(body, "workerId") ?? process.env.LOOP_WORKER_ID?.trim(),
      });
      finishRunLiveForStory(projectRoot, storyId);
      json(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/patterns") {
      const content = pickString(body, "content", "").trim();
      if (!content) throw new Error("content 必填");
      db.addPattern(projectName, content);
      json(res, { ok: true, patterns: db.getPatterns(projectName) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/patterns/update") {
      const index = pickInteger(body, "index");
      const content = pickString(body, "content", "").trim();
      if (!content) throw new Error("content 必填");
      db.updatePattern(projectName, index, content);
      json(res, { ok: true, patterns: db.getPatterns(projectName) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/patterns/delete") {
      const index = pickInteger(body, "index");
      db.deletePattern(projectName, index);
      json(res, { ok: true, patterns: db.getPatterns(projectName) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/project-spec") {
      const spec = db.updateProjectSpec(projectName, pickString(body, "content", ""));
      json(res, { ok: true, projectSpec: spec });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/project-spec/template") {
      const templateId = pickString(body, "templateId", "").trim();
      if (!templateId) throw new Error("templateId 必填");
      const spec = db.applyProjectSpecTemplate(projectName, templateId, {
        append: pickBoolean(body, "append", false),
      });
      json(res, { ok: true, projectSpec: spec });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/project/update") {
      const patch: {
        branchName?: string;
        description?: string;
        vision?: string;
      } = {};
      patchString(patch, body, "branchName");
      patchString(patch, body, "description");
      patchString(patch, body, "vision");
      if (!Object.keys(patch).length) {
        throw new Error("至少提供 branchName、description 或 vision");
      }
      const project = db.updateProjectMeta(projectName, patch);
      json(res, {
        ok: true,
        project,
        status: db.getStatus(projectName),
      });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/loop-run/start") {
      const { startLoopRunBackground } = await import("./loop-run-launcher.js");
      const result = await startLoopRunBackground(projectRoot, {
        tool: pickOptionalString(body, "tool"),
        untilStop: pickBoolean(body, "untilStop", true),
        maxIterations:
          body.maxIterations !== undefined ? pickNumber(body, "maxIterations") : undefined,
        workers: body.workers !== undefined ? pickNumber(body, "workers") : undefined,
      });
      json(res, { ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/loop-run/stop") {
      const { requestLoopRunStop } = await import("./run-process.js");
      const result = requestLoopRunStop(
        projectRoot,
        pickOptionalString(body, "workerId")
      );
      json(res, { ...result });
      return true;
    }

    json(res, { error: "Not Found" }, 404);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json(res, { error: message }, 400);
    return true;
  }
}

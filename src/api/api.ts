import type { IncomingMessage, ServerResponse } from "node:http";
import type { LoopStateDb } from "../db/db.js";
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
import {
  readJsonBody,
  requireBodyString,
  resolveProjectName,
  sendJson,
} from "./http-utils.js";
import { finishRunLiveForStory } from "../loop/run-live.js";
import { parseRequiredStoryWorkType } from "../domain/story-work-type.js";

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

    if (req.method === "POST" && pathname === "/api/agents") {
      const profile = db.saveAgentProfile(
        projectName,
        body,
        pickOptionalString(body, "id")
      );
      sendJson(res, { ok: true, profile });
      return true;
    }
    if (req.method === "POST" && pathname === "/api/agents/default") {
      const agentConfig = db.setDefaultAgentProfile(projectName, pickNullableString(body, "id"));
      sendJson(res, { ok: true, agentConfig });
      return true;
    }
    if (req.method === "DELETE" && pathname === "/api/agents") {
      const agentConfig = db.deleteAgentProfile(projectName, requireBodyString(body, "id"));
      sendJson(res, { ok: true, agentConfig });
      return true;
    }
    if (req.method === "POST" && pathname === "/api/stories/agent-profile") {
      const story = db.setStoryAgentProfile(
        projectName,
        requireBodyString(body, "storyId"),
        pickNullableString(body, "agentProfileId")
      );
      sendJson(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/milestones") {
      const title = pickString(body, "title", "").trim();
      if (!title) throw new Error("title 必填");
      const milestone = db.addMilestone(projectName, {
        title,
        description: pickString(body, "description", ""),
        targetDate: pickOptionalString(body, "targetDate"),
        version: pickOptionalString(body, "version"),
      });
      sendJson(res, { ok: true, milestone });
      return true;
    }

    if (
      (req.method === "PATCH" && pathname === "/api/milestones") ||
      (req.method === "POST" && pathname === "/api/milestones/update")
    ) {
      const id = requireBodyString(body, "id");
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
      sendJson(res, { ok: true, milestone });
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
      sendJson(res, { ok: true, feature });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/features/update") {
      const id = requireBodyString(body, "id");
      const patch: { title?: string; description?: string } = {};
      patchString(patch, body, "title");
      patchString(patch, body, "description");
      const feature = db.updateFeature(projectName, id, patch);
      sendJson(res, { ok: true, feature });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/features/delete") {
      const id = requireBodyString(body, "id");
      const deletedIds = db.deleteFeature(projectName, id);
      sendJson(res, { ok: true, deletedIds });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/mindmap/reorder") {
      const id = requireBodyString(body, "id");
      const kind = pickEnum(body, "kind", ["feature", "story"] as const);
      const direction = pickEnum(body, "direction", ["up", "down"] as const);
      if (kind === "feature") {
        const feature = db.reorderFeature(projectName, id, direction);
        sendJson(res, { ok: true, feature });
      } else {
        const story = db.reorderStory(projectName, id, direction);
        sendJson(res, { ok: true, story });
      }
      return true;
    }

    if (req.method === "POST" && pathname === "/api/mindmap/move") {
      const id = requireBodyString(body, "id");
      const kind = pickEnum(body, "kind", ["feature", "story"] as const);
      const parentId = pickNullableString(body, "parentId");
      const result = db.moveMindMapItem(projectName, { id, kind, parentId });
      sendJson(res, {
        ok: true,
        ...(kind === "feature" ? { feature: result } : { story: result }),
      });
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
      sendJson(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/confirm") {
      const storyId = requireBodyString(body, "storyId");
      const story = db.confirmStory(projectName, storyId);
      sendJson(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/unconfirm") {
      const storyId = requireBodyString(body, "storyId");
      const story = db.unconfirmStory(projectName, storyId);
      sendJson(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/delete") {
      const storyId = requireBodyString(body, "storyId");
      db.deleteStory(projectName, storyId);
      sendJson(res, { ok: true });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/request-removal") {
      const storyId = requireBodyString(body, "storyId");
      const result = db.requestStoryRemoval(
        projectName,
        storyId,
        pickOptionalString(body, "reason")
      );
      sendJson(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/cancel-removal") {
      const storyId = requireBodyString(body, "storyId");
      const result = db.cancelStoryRemoval(projectName, storyId);
      sendJson(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/archive") {
      const storyId = requireBodyString(body, "storyId");
      const result = db.archiveStory(
        projectName,
        storyId,
        pickOptionalString(body, "reason")
      );
      sendJson(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/restore") {
      const storyId = requireBodyString(body, "storyId");
      const result = db.restoreStory(projectName, storyId);
      sendJson(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/purge") {
      const storyId = requireBodyString(body, "storyId");
      db.purgeStory(projectName, storyId);
      sendJson(res, { ok: true });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/dependencies") {
      const from = requireBodyString(body, "from");
      const to = requireBodyString(body, "to");
      const story = db.addStoryDependency(projectName, from, to);
      sendJson(res, { ok: true, story });
      return true;
    }

    if (req.method === "DELETE" && pathname === "/api/dependencies") {
      const from = requireBodyString(body, "from");
      const to = requireBodyString(body, "to");
      const story = db.removeStoryDependency(projectName, from, to);
      sendJson(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/milestone") {
      const storyId = requireBodyString(body, "storyId");
      const story = db.setStoryMilestone(
        projectName,
        storyId,
        pickNullableString(body, "milestoneId")
      );
      sendJson(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/priority") {
      const storyId = requireBodyString(body, "storyId");
      const priority = pickInteger(body, "priority");
      const story = db.setStoryPriority(projectName, storyId, priority);
      sendJson(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/preferred-tool") {
      const storyId = requireBodyString(body, "storyId");
      const story = db.setStoryPreferredTool(
        projectName,
        storyId,
        pickNullableString(body, "preferredTool") as
          | import("../domain/types.js").PreferredTool
          | null
      );
      sendJson(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/update") {
      const storyId = requireBodyString(body, "storyId");
      const patch: {
        title?: string;
        description?: string;
        workType?: import("../domain/types.js").StoryWorkType;
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
      sendJson(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/complete") {
      const storyId = requireBodyString(body, "storyId");
      const result = db.completeStoryWithProgress(projectName, storyId, {
        summary: pickString(body, "summary", ""),
        learnings:
          body.learnings !== undefined
            ? pickStringArray(body, "learnings")
            : undefined,
        workerId:
          pickOptionalString(body, "workerId") ?? process.env.LOOP_WORKER_ID?.trim(),
      });
      finishRunLiveForStory(projectRoot, storyId);
      sendJson(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/patterns") {
      const content = pickString(body, "content", "").trim();
      if (!content) throw new Error("content 必填");
      db.addPattern(projectName, content);
      sendJson(res, { ok: true, patterns: db.getPatterns(projectName) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/patterns/update") {
      const index = pickInteger(body, "index");
      const content = pickString(body, "content", "").trim();
      if (!content) throw new Error("content 必填");
      db.updatePattern(projectName, index, content);
      sendJson(res, { ok: true, patterns: db.getPatterns(projectName) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/patterns/delete") {
      const index = pickInteger(body, "index");
      db.deletePattern(projectName, index);
      sendJson(res, { ok: true, patterns: db.getPatterns(projectName) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/project-spec") {
      const spec = db.updateProjectSpec(projectName, pickString(body, "content", ""));
      sendJson(res, { ok: true, projectSpec: spec });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/project-spec/template") {
      const templateId = pickString(body, "templateId", "").trim();
      if (!templateId) throw new Error("templateId 必填");
      const spec = db.applyProjectSpecTemplate(projectName, templateId, {
        append: pickBoolean(body, "append", false),
      });
      sendJson(res, { ok: true, projectSpec: spec });
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
      sendJson(res, {
        ok: true,
        project,
        status: db.getStatus(projectName),
      });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/loop-run/start") {
      const { startLoopRunBackground } = await import("../loop/loop-run-launcher.js");
      const result = await startLoopRunBackground(projectRoot, {
        tool: pickOptionalString(body, "tool"),
        agentProfileId: pickOptionalString(body, "agentProfileId"),
        untilStop: pickBoolean(body, "untilStop", true),
        maxIterations:
          body.maxIterations !== undefined ? pickNumber(body, "maxIterations") : undefined,
        workers: body.workers !== undefined ? pickNumber(body, "workers") : undefined,
      });
      sendJson(res, { ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/loop-run/stop") {
      const { requestLoopRunStop } = await import("../loop/run-process.js");
      const result = requestLoopRunStop(
        projectRoot,
        pickOptionalString(body, "workerId")
      );
      sendJson(res, { ...result });
      return true;
    }

    sendJson(res, { error: "Not Found" }, 404);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, { error: message }, 400);
    return true;
  }
}

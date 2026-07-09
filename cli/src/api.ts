import type { IncomingMessage, ServerResponse } from "node:http";
import type { LoopStateDb } from "./db.js";
import { getProjectName } from "./get-project-name.js";
import { finishRunLiveForStory } from "./run-live.js";

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
      const title = String(body.title ?? "").trim();
      if (!title) throw new Error("title 必填");
      const milestone = db.addMilestone(projectName, {
        title,
        description: String(body.description ?? ""),
        targetDate:
          body.targetDate !== undefined ? String(body.targetDate) : undefined,
        version: body.version !== undefined ? String(body.version) : undefined,
      });
      json(res, { ok: true, milestone });
      return true;
    }

    if (req.method === "PATCH" && pathname === "/api/milestones") {
      const id = String(body.id ?? "");
      if (!id) throw new Error("id 必填");
      const patch: {
        title?: string;
        description?: string;
        targetDate?: string;
        version?: string;
      } = {};
      if (body.title !== undefined) {
        patch.title = String(body.title).trim();
      }
      if (body.description !== undefined) {
        patch.description = String(body.description);
      }
      if (body.targetDate !== undefined) {
        patch.targetDate = String(body.targetDate);
      }
      if (body.version !== undefined) {
        patch.version = String(body.version);
      }
      const milestone = db.updateMilestone(projectName, id, patch);
      json(res, { ok: true, milestone });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/milestones/update") {
      const id = String(body.id ?? "");
      if (!id) throw new Error("id 必填");
      const patch: {
        title?: string;
        description?: string;
        targetDate?: string;
        version?: string;
      } = {};
      if (body.title !== undefined) {
        patch.title = String(body.title).trim();
      }
      if (body.description !== undefined) {
        patch.description = String(body.description);
      }
      if (body.targetDate !== undefined) {
        patch.targetDate = String(body.targetDate);
      }
      if (body.version !== undefined) {
        patch.version = String(body.version);
      }
      const milestone = db.updateMilestone(projectName, id, patch);
      json(res, { ok: true, milestone });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/features") {
      const title = String(body.title ?? "").trim();
      if (!title) throw new Error("title 必填");
      const feature = db.addFeature(projectName, {
        title,
        description: String(body.description ?? ""),
        parentId: (body.parentId as string) ?? null,
      });
      json(res, { ok: true, feature });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/features/update") {
      const id = String(body.id ?? "");
      if (!id) throw new Error("id 必填");
      const patch: { title?: string; description?: string } = {};
      if (body.title !== undefined) patch.title = String(body.title);
      if (body.description !== undefined) {
        patch.description = String(body.description);
      }
      const feature = db.updateFeature(projectName, id, patch);
      json(res, { ok: true, feature });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/features/delete") {
      const id = String(body.id ?? "");
      if (!id) throw new Error("id 必填");
      const deletedIds = db.deleteFeature(projectName, id);
      json(res, { ok: true, deletedIds });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/mindmap/reorder") {
      const id = String(body.id ?? "");
      const kind = String(body.kind ?? "");
      const direction = String(body.direction ?? "");
      if (!id) throw new Error("id 必填");
      if (kind !== "feature" && kind !== "story") {
        throw new Error("kind 必须为 feature 或 story");
      }
      if (direction !== "up" && direction !== "down") {
        throw new Error("direction 必须为 up 或 down");
      }
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
      const id = String(body.id ?? "");
      const kind = String(body.kind ?? "");
      if (!id) throw new Error("id 必填");
      if (kind !== "feature" && kind !== "story") {
        throw new Error("kind 必须为 feature 或 story");
      }
      const rawParent = body.parentId;
      const parentId =
        rawParent === null || rawParent === undefined || rawParent === ""
          ? null
          : String(rawParent);
      const result = db.moveMindMapItem(projectName, { id, kind, parentId });
      json(res, { ok: true, ...(kind === "feature" ? { feature: result } : { story: result }) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories") {
      const title = String(body.title ?? "").trim();
      if (!title) throw new Error("title 必填");
      const story = db.addStory(projectName, {
        title,
        description: String(body.description ?? `作为用户，我需要：${title}`),
        milestoneId: (body.milestoneId as string) ?? null,
        parentId: (body.parentId as string) ?? null,
        dependsOn: Array.isArray(body.dependsOn)
          ? (body.dependsOn as string[])
          : [],
        acceptanceCriteria: Array.isArray(body.acceptanceCriteria)
          ? (body.acceptanceCriteria as string[])
          : ["实现功能", "npm test 通过"],
        priority: Number(body.priority ?? 0),
        notes: "",
      });
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/confirm") {
      const storyId = String(body.storyId ?? "");
      if (!storyId) throw new Error("storyId 必填");
      const story = db.confirmStory(projectName, storyId);
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/unconfirm") {
      const storyId = String(body.storyId ?? "");
      if (!storyId) throw new Error("storyId 必填");
      const story = db.unconfirmStory(projectName, storyId);
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/delete") {
      const storyId = String(body.storyId ?? "");
      if (!storyId) throw new Error("storyId 必填");
      db.deleteStory(projectName, storyId);
      json(res, { ok: true });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/request-removal") {
      const storyId = String(body.storyId ?? "");
      if (!storyId) throw new Error("storyId 必填");
      const reason =
        body.reason !== undefined ? String(body.reason) : undefined;
      const result = db.requestStoryRemoval(projectName, storyId, reason);
      json(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/cancel-removal") {
      const storyId = String(body.storyId ?? "");
      if (!storyId) throw new Error("storyId 必填");
      const result = db.cancelStoryRemoval(projectName, storyId);
      json(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/archive") {
      const storyId = String(body.storyId ?? "");
      if (!storyId) throw new Error("storyId 必填");
      const reason =
        body.reason !== undefined ? String(body.reason) : undefined;
      const result = db.archiveStory(projectName, storyId, reason);
      json(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/restore") {
      const storyId = String(body.storyId ?? "");
      if (!storyId) throw new Error("storyId 必填");
      const result = db.restoreStory(projectName, storyId);
      json(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/purge") {
      const storyId = String(body.storyId ?? "");
      if (!storyId) throw new Error("storyId 必填");
      db.purgeStory(projectName, storyId);
      json(res, { ok: true });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/dependencies") {
      const from = String(body.from ?? "");
      const to = String(body.to ?? "");
      if (!from || !to) throw new Error("from 与 to 必填");
      const story = db.addStoryDependency(projectName, from, to);
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "DELETE" && pathname === "/api/dependencies") {
      const from = String(body.from ?? "");
      const to = String(body.to ?? "");
      if (!from || !to) throw new Error("from 与 to 必填");
      const story = db.removeStoryDependency(projectName, from, to);
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/milestone") {
      const storyId = String(body.storyId ?? "");
      if (!storyId) throw new Error("storyId 必填");
      const raw = body.milestoneId;
      const milestoneId =
        raw === null || raw === undefined || raw === ""
          ? null
          : String(raw);
      const story = db.setStoryMilestone(projectName, storyId, milestoneId);
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/priority") {
      const storyId = String(body.storyId ?? "");
      if (!storyId) throw new Error("storyId 必填");
      const priority = Number(body.priority);
      if (!Number.isInteger(priority) || priority < 0) {
        throw new Error("priority 必须为非负整数");
      }
      const story = db.setStoryPriority(projectName, storyId, priority);
      json(res, { ok: true, story });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/update") {
      const storyId = String(body.storyId ?? "");
      if (!storyId) throw new Error("storyId 必填");
      const patch: {
        title?: string;
        description?: string;
        acceptanceCriteria?: string[];
        changeNote?: string;
        status?: "draft" | "ready";
      } = {};
      if (body.title !== undefined) patch.title = String(body.title);
      if (body.description !== undefined) {
        patch.description = String(body.description);
      }
      if (body.acceptanceCriteria !== undefined) {
        if (!Array.isArray(body.acceptanceCriteria)) {
          throw new Error("acceptanceCriteria 必须为字符串数组");
        }
        patch.acceptanceCriteria = (body.acceptanceCriteria as unknown[])
          .map((item) => String(item).trim())
          .filter(Boolean);
      }
      if (body.changeNote !== undefined) {
        patch.changeNote = String(body.changeNote);
      }
      if (body.status !== undefined) {
        const status = String(body.status);
        if (status !== "draft" && status !== "ready") {
          throw new Error("status 必须为 draft 或 ready");
        }
        patch.status = status;
      }
      const result = db.updateStory(projectName, storyId, patch);
      json(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/stories/complete") {
      const storyId = String(body.storyId ?? "");
      if (!storyId) throw new Error("storyId 必填");
      const summary = String(body.summary ?? "");
      const learnings = Array.isArray(body.learnings)
        ? (body.learnings as string[])
        : undefined;
      const result = db.completeStoryWithProgress(projectName, storyId, {
        summary,
        learnings,
        workerId:
          body.workerId !== undefined
            ? String(body.workerId)
            : process.env.LOOP_WORKER_ID?.trim(),
      });
      finishRunLiveForStory(projectRoot, storyId);
      json(res, { ok: true, ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/patterns") {
      const content = String(body.content ?? "").trim();
      if (!content) throw new Error("content 必填");
      db.addPattern(projectName, content);
      json(res, { ok: true, patterns: db.getPatterns(projectName) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/patterns/update") {
      const index = Number(body.index);
      const content = String(body.content ?? "").trim();
      if (!Number.isInteger(index) || index < 0) {
        throw new Error("index 必须为非负整数");
      }
      if (!content) throw new Error("content 必填");
      db.updatePattern(projectName, index, content);
      json(res, { ok: true, patterns: db.getPatterns(projectName) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/patterns/delete") {
      const index = Number(body.index);
      if (!Number.isInteger(index) || index < 0) {
        throw new Error("index 必须为非负整数");
      }
      db.deletePattern(projectName, index);
      json(res, { ok: true, patterns: db.getPatterns(projectName) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/project-spec") {
      const content = String(body.content ?? "");
      const spec = db.updateProjectSpec(projectName, content);
      json(res, { ok: true, projectSpec: spec });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/project-spec/template") {
      const templateId = String(body.templateId ?? "").trim();
      if (!templateId) throw new Error("templateId 必填");
      const append = body.append === true;
      const spec = db.applyProjectSpecTemplate(projectName, templateId, {
        append,
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
      if (body.branchName !== undefined) {
        patch.branchName = String(body.branchName);
      }
      if (body.description !== undefined) {
        patch.description = String(body.description);
      }
      if (body.vision !== undefined) {
        patch.vision = String(body.vision);
      }
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
      const untilStop =
        body.untilStop === undefined ? true : Boolean(body.untilStop);
      const maxIterations =
        body.maxIterations !== undefined
          ? Number(body.maxIterations)
          : undefined;
      const result = await startLoopRunBackground(projectRoot, {
        tool: body.tool !== undefined ? String(body.tool) : undefined,
        untilStop,
        maxIterations,
        workers:
          body.workers !== undefined ? Number(body.workers) : undefined,
      });
      json(res, { ...result });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/loop-run/stop") {
      const { requestLoopRunStop } = await import("./run-process.js");
      const workerId =
        body.workerId !== undefined ? String(body.workerId) : undefined;
      const result = requestLoopRunStop(projectRoot, workerId);
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

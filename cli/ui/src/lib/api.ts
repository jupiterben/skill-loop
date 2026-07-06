const readJson = async (res: Response) => {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    throw new Error(`无效响应: ${text.slice(0, 120)}`);
  }
};

const post = async (path: string, body: Record<string, unknown>) => {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJson(res);
  if (!res.ok) throw new Error(String(json.error ?? `HTTP ${res.status}`));
  return json;
};

const del = async (path: string, body: Record<string, unknown>) => {
  const res = await fetch(path, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJson(res);
  if (!res.ok) throw new Error(String(json.error ?? `HTTP ${res.status}`));
  return json;
};

export const api = {
  addMilestone: (title: string) => post("/api/milestones", { title }),
  updateMilestone: (id: string, title: string) =>
    post("/api/milestones/update", { id, title }),
  addFeature: (input: { title: string; parentId?: string | null }) =>
    post("/api/features", input),
  updateFeature: (input: {
    id: string;
    title?: string;
    description?: string;
  }) => post("/api/features/update", input),
  deleteFeature: (id: string) => post("/api/features/delete", { id }),
  reorderMindMapItem: (input: {
    id: string;
    kind: "feature" | "story";
    direction: "up" | "down";
  }) => post("/api/mindmap/reorder", input),
  moveMindMapItem: (input: {
    id: string;
    kind: "feature" | "story";
    parentId: string | null;
  }) => post("/api/mindmap/move", input),
  addStory: (input: {
    title: string;
    description?: string;
    acceptanceCriteria?: string[];
    milestoneId?: string | null;
    parentId?: string | null;
  }) => post("/api/stories", input),
  confirmStory: (storyId: string) => post("/api/stories/confirm", { storyId }),
  unconfirmStory: (storyId: string) => post("/api/stories/unconfirm", { storyId }),
  deleteStory: (storyId: string) => post("/api/stories/delete", { storyId }),
  requestStoryRemoval: (storyId: string, reason?: string) =>
    post("/api/stories/request-removal", { storyId, reason }),
  cancelStoryRemoval: (storyId: string) =>
    post("/api/stories/cancel-removal", { storyId }),
  archiveStory: (storyId: string, reason?: string) =>
    post("/api/stories/archive", { storyId, reason }),
  restoreStory: (storyId: string) => post("/api/stories/restore", { storyId }),
  purgeStory: (storyId: string) => post("/api/stories/purge", { storyId }),
  setStoryMilestone: (storyId: string, milestoneId: string | null) =>
    post("/api/stories/milestone", { storyId, milestoneId }),
  setStoryPriority: (storyId: string, priority: number) =>
    post("/api/stories/priority", { storyId, priority }),
  updateStory: (input: {
    storyId: string;
    title?: string;
    description?: string;
    acceptanceCriteria?: string[];
    changeNote?: string;
    status?: "draft" | "ready";
  }) => post("/api/stories/update", input),
  completeStory: (input: {
    storyId: string;
    summary: string;
    learnings?: string[];
  }) => post("/api/stories/complete", input),
  addDependency: (from: string, to: string) =>
    post("/api/dependencies", { from, to }),
  removeDependency: (from: string, to: string) =>
    del("/api/dependencies", { from, to }),
  startLoopRun: (input?: {
    tool?: string;
    untilStop?: boolean;
    maxIterations?: number;
  }) => post("/api/loop-run/start", input ?? {}),
  stopLoopRun: () => post("/api/loop-run/stop", {}),
  addPattern: (content: string) => post("/api/patterns", { content }),
  updatePattern: (index: number, content: string) =>
    post("/api/patterns/update", { index, content }),
  deletePattern: (index: number) => post("/api/patterns/delete", { index }),
  updateProjectSpec: (content: string) =>
    post("/api/project-spec", { content }),
  applyProjectSpecTemplate: (templateId: string, append = false) =>
    post("/api/project-spec/template", { templateId, append }),
};

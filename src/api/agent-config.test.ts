import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../db/db.js";
import { handleDashboardApiRequest } from "./http-handlers.js";

describe("Agent configuration HTTP API", () => {
  let root: string;
  let server: Server;
  let base: string;
  let db: LoopStateDb;
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "loop-agent-api-"));
    db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    server = createServer((req, res) => {
      void handleDashboardApiRequest(req, res, db, root, new URL(req.url ?? "/", "http://localhost").pathname);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing server address");
    base = `http://127.0.0.1:${address.port}`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    rmSync(root, { recursive: true, force: true });
  });
  async function request(path: string, body: unknown, method = "POST") {
    const response = await fetch(base + path, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  it("creates, updates, selects, clears and deletes a project profile", async () => {
    const created = await request("/api/agents", {
      name: "Project reviewer", tool: "codex", model: "review-model", enabled: true,
    });
    expect(created.status).toBe(200);
    const profile = created.body.profile;
    expect(profile.id).toBe("AG-001");
    expect((await request("/api/agents", { ...profile, model: "new-model" })).status).toBe(200);
    expect((await request("/api/agents/default", { id: profile.id })).status).toBe(200);
    const dashboard = await (await fetch(base + "/api/dashboard")).json();
    expect(Array.isArray(dashboard.installedAgentTools)).toBe(true);
    expect(dashboard.installedAgentTools).not.toContain("cursor");
    expect(dashboard.installedAgentTools).not.toContain("minimax");
    expect(dashboard.agentConfig.defaultProfileId).toBe(profile.id);
    expect(dashboard.agentConfig.profiles[0].model).toBe("new-model");
    expect((await request("/api/agents", { id: profile.id }, "DELETE")).status).toBe(400);
    await request("/api/agents/default", { id: null });
    expect((await request("/api/agents", { id: profile.id }, "DELETE")).status).toBe(200);
  });
  it("persists Story profile selection while keeping the Story draft", async () => {
    const profile = db.saveAgentProfile("demo", { name: "Agent", tool: "codex" });
    const story = db.addStory("demo", {
      title: "Example", description: "", workType: "testing", acceptanceCriteria: ["AC"], status: "draft",
    });
    const result = await request("/api/stories/agent-profile", {
      storyId: story.id, agentProfileId: profile.id,
    });
    expect(result.body.story).toMatchObject({ agentProfileId: profile.id, status: "draft", passes: false });
    expect((await request("/api/stories/agent-profile", {
      storyId: story.id, agentProfileId: "AG-999",
    })).status).toBe(400);
  });
  it("rejects malicious model values and conflicting launch parameters before execution", async () => {
    expect((await request("/api/agents", {
      name: "Invalid", tool: "codex", model: "x & echo injected",
    })).status).toBe(400);
    const result = await request("/api/loop-run/start", {
      agentProfileId: "AG-001", tool: "codex",
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain("cannot be used together");
  });

  it("lists only the selected CLI's saved models and rejects unknown tools", async () => {
    db.saveAgentProfile("demo", { name: "Writer", tool: "claude", model: "saved-model" });
    db.saveAgentProfile("demo", { name: "Reviewer", tool: "codex", model: "other-model" });
    const response = await fetch(base + "/api/agent-models?tool=claude");
    expect(response.status).toBe(200);
    expect((await response.json()).models).toEqual([{ id: "saved-model", name: "saved-model" }]);
    expect((await fetch(base + "/api/agent-models?tool=invalid")).status).toBe(400);
  });
});

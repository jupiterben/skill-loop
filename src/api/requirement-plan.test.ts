import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoopStateDb } from "../db/db.js";
import { handleDashboardApiRequest } from "./http-handlers.js";
import { runPlan } from "../loop/loop-plan.js";
import { getRequirementPlan } from "../loop/requirement-plan.js";

vi.mock("../loop/loop-plan.js", () => ({ runPlan: vi.fn() }));

describe("Requirement planning HTTP API", () => {
  let root: string;
  let db: LoopStateDb;
  let server: Server;
  let url: string;
  let finish: () => void;
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "loop-requirement-api-"));
    db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    vi.mocked(runPlan).mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve({ ok: true, tool: "codex", promptPath: "", storyId: null, output: "PLANNED" });
    }));
    server = createServer((req, res) => {
      void handleDashboardApiRequest(req, res, db, root, new URL(req.url ?? "/", "http://localhost").pathname);
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing address");
    url = `http://127.0.0.1:${address.port}/api/requirements/plan`;
  });
  afterEach(async () => {
    if (getRequirementPlan(root)?.status === "running") {
      finish();
      await vi.waitFor(() => expect(getRequirementPlan(root)?.status).not.toBe("running"));
    }
    await new Promise<void>((done) => server.close(() => done()));
    db.close();
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes("loop-requirement-api-")) throw new Error("Unsafe test path");
    rmSync(root, { recursive: true, force: true });
    vi.resetAllMocks();
  });
  async function post(body: unknown) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  it("accepts asynchronously, polls persisted results, and rejects a concurrent job", async () => {
    expect(await (await fetch(url)).json()).toEqual({ job: null });
    const response = await post({ id: "request-001", requirement: "Reset password", agentProfileId: "AG-001" });
    expect(response.status).toBe(202);
    expect((await response.json()).job.status).toBe("running");
    expect(runPlan).toHaveBeenCalledWith(db, root, expect.objectContaining({ newRequirement: true, agentProfileId: "AG-001" }));
    expect((await post({ id: "request-002", requirement: "Another request" })).status).toBe(400);
    finish();
    await vi.waitFor(() => expect(getRequirementPlan(root)?.status).toBe("completed"));
    const recovered = await (await fetch(url)).json();
    expect(recovered.job).toMatchObject({ id: "request-001", status: "completed", output: "PLANNED" });
    expect(recovered.job.pid).toBeUndefined();
  });
  it("validates request content without invoking an agent", async () => {
    expect((await post({ id: "request-001", requirement: "" })).status).toBe(400);
    expect((await post({ id: "../bad", requirement: "Hello" })).status).toBe(400);
    expect(runPlan).not.toHaveBeenCalled();
  });
});

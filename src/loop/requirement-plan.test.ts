import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoopStateDb } from "../db/db.js";
import { invokeAgentProcess } from "./agent-invoke.js";
import { getRequirementPlan, startRequirementPlan } from "./requirement-plan.js";
import { writeJsonFile } from "../infra/json-fs.js";
import { getStatusDir } from "../infra/paths.js";

vi.mock("./agent-invoke.js", () => ({ invokeAgentProcess: vi.fn() }));
vi.mock("./loop-run.js", () => ({ resolveRunTool: (tool?: string) => tool ?? "codex" }));

describe("Dashboard requirement planning", () => {
  let root: string;
  let db: LoopStateDb;
  let finish: (value: string) => void;
  let fail: (reason: Error) => void;
  beforeEach(() => {
    vi.resetAllMocks();
    root = mkdtempSync(join(tmpdir(), "loop-requirement-test-"));
    db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "Requirements" });
    db.addFeature("demo", { title: "Authentication", description: "Identity and login", parentId: null });
    db.addStory("demo", {
      title: "Existing next story", description: "", workType: "implementation",
      acceptanceCriteria: ["AC"], parentId: "FT-001", status: "ready",
    });
    vi.mocked(invokeAgentProcess).mockImplementation(() => new Promise((resolve, reject) => {
      finish = resolve;
      fail = reject;
    }));
  });
  afterEach(async () => {
    if (getRequirementPlan(root)?.status === "running") { finish("Test cleanup"); await done(); }
    db.close();
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes("loop-requirement-test-")) throw new Error("Unsafe test root");
    rmSync(root, { recursive: true, force: true });
  });
  async function done() {
    await vi.waitFor(() => expect(getRequirementPlan(root)?.status).not.toBe("running"));
    return getRequirementPlan(root)!;
  }
  function start(id = "request-001") {
    return startRequirementPlan(db, root, "demo", { id, requirement: "Allow password reset", tool: "codex" });
  }
  it("returns a job immediately and passes context without targeting the existing next Story", async () => {
    expect(start().status).toBe("running");
    const [tool, prompt, options] = vi.mocked(invokeAgentProcess).mock.calls[0];
    expect(tool).toBe("codex");
    expect(prompt).toContain("Authentication");
    expect(prompt).toContain("Allow password reset");
    expect(prompt).toContain("只新增");
    expect(prompt).toContain("--work-type");
    expect(prompt).not.toContain("**目标 Story**");
    expect(options.env).toMatchObject({ LOOP_PROJECT_ROOT: root, LOOP_PROJECT_NAME: "demo" });
    expect(options.timeoutMs).toBe(300000);
    options.onDisplay("Selecting Authentication");
    expect(getRequirementPlan(root)?.output).toContain("Selecting Authentication");
    db.addStory("demo", {
      title: "Password reset", description: "", workType: "implementation",
      parentId: "FT-001", acceptanceCriteria: ["Reset link expires"], status: "draft",
    });
    finish("已归入 Authentication <promise>PLANNED</promise>");
    expect(await done()).toMatchObject({
      status: "completed",
      stories: [{ id: "US-002", title: "Password reset", parentId: "FT-001", featureTitle: "Authentication" }],
      features: [],
    });
    expect(db.getStories("demo")[0].status).toBe("ready");
  });
  it("deduplicates retries and prevents concurrent submissions for the project", async () => {
    start();
    expect(start().id).toBe("request-001");
    expect(() => start("request-002")).toThrow("已有需求正在规划");
    expect(invokeAgentProcess).toHaveBeenCalledTimes(1);
    finish("No changes");
    await done();
    expect(start().status).toBe("completed");
    expect(invokeAgentProcess).toHaveBeenCalledTimes(1);
  });
  it("reports partial writes on failure rather than silently retrying", async () => {
    start();
    const feature = db.addFeature("demo", { title: "Billing", description: "", parentId: null });
    db.addStory("demo", { title: "Invoice", description: "", workType: "implementation", parentId: feature.id, acceptanceCriteria: ["AC"] });
    fail(new Error("CLI authentication failed"));
    const job = await done();
    expect(job.status).toBe("failed");
    expect(job.error).toContain("authentication failed");
    expect(job.features).toEqual([{ id: feature.id, title: "Billing" }]);
    expect(job.stories[0].featureTitle).toBe("Billing");
    expect(invokeAgentProcess).toHaveBeenCalledTimes(1);
  });
  it("validates empty, oversized and unsafe requests before any invocation", () => {
    for (const input of [
      { id: "../unsafe", requirement: "test" },
      { id: "request-001", requirement: " " },
      { id: "request-001", requirement: "x".repeat(12001) },
    ]) expect(() => startRequirementPlan(db, root, "demo", input)).toThrow();
    expect(invokeAgentProcess).not.toHaveBeenCalled();
  });
  it("marks an interrupted owner as failed without auto-restarting", () => {
    writeJsonFile(join(getStatusDir(root), "requirement-plan.json"), {
      id: "old-request", pid: 2147483647, status: "running", stories: [], features: [],
    });
    expect(getRequirementPlan(root)?.status).toBe("failed");
    expect(invokeAgentProcess).not.toHaveBeenCalled();
  });
});

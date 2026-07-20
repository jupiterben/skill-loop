import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";

describe("Story preferredTool", () => {
  const roots: string[] = [];
  afterEach(() => {
    while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  function createDb() {
    const root = mkdtempSync(join(tmpdir(), "loop-pref-tool-"));
    roots.push(root);
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    const feature = db.addFeature("demo", { title: "F1", description: "" });
    const story = db.addStory("demo", {
      parentId: feature.id,
      title: "S1",
      description: "",
      acceptanceCriteria: ["AC"],
      status: "ready",
    });
    return { db, story };
  }

  it("setStoryPreferredTool 写入并清空", () => {
    const { db, story } = createDb();
    const set = db.setStoryPreferredTool("demo", story.id, "claude");
    expect(set.preferredTool).toBe("claude");
    expect(db.getStories("demo").find((s) => s.id === story.id)?.preferredTool).toBe(
      "claude"
    );
    const cleared = db.setStoryPreferredTool("demo", story.id, null);
    expect(cleared.preferredTool).toBeNull();
  });

  it("setStoryPreferredTool 非法值报错", () => {
    const { db, story } = createDb();
    expect(() =>
      db.setStoryPreferredTool("demo", story.id, "gpt" as "agent")
    ).toThrow(/preferredTool/);
  });

  it("setStoryPreferredTool 不重置 passes/status、不写 progress", () => {
    const { db, story } = createDb();
    db.completeStoryWithProgress("demo", story.id, { summary: "done" });
    const before = db.getProgress("demo", 50).length;
    const updated = db.setStoryPreferredTool("demo", story.id, "agent");
    expect(updated.passes).toBe(true);
    expect(updated.status).toBe("ready");
    expect(db.getProgress("demo", 50).length).toBe(before);
  });

  it("归档 Story 不能设置 preferredTool", () => {
    const { db, story } = createDb();
    db.completeStoryWithProgress("demo", story.id, { summary: "done" });
    db.requestStoryRemoval("demo", story.id);
    db.archiveStory("demo", story.id);
    expect(() =>
      db.setStoryPreferredTool("demo", story.id, "claude")
    ).toThrow(/归档/);
  });

  it("runWorkerIteration 使用 resolveStoryTool", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(here, "../../../../src/loop-run.ts"),
      "utf8"
    );
    expect(src).toContain("resolveStoryTool(");
    expect(src).toMatch(/effectiveTool|storyTool/);
  });

  it("API 暴露 /api/stories/preferred-tool", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const apiSrc = readFileSync(
      join(here, "../../../../src/api.ts"),
      "utf8"
    );
    expect(apiSrc).toContain('pathname === "/api/stories/preferred-tool"');
    expect(apiSrc).toContain("setStoryPreferredTool");
  });
});

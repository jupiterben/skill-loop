import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import { getNextStory } from "../../../../src/tree.js";

describe("PRD 查询与导航命令", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createDb() {
    const root = mkdtempSync(join(tmpdir(), "loop-prd-nav-"));
    roots.push(root);
    mkdirSync(join(root, "loop-data"), { recursive: true });
    const db = new LoopStateDb(root);
    db.upsertProject({
      name: "demo",
      branchName: "main",
      description: "测试项目",
    });
    db.addFeature("demo", { title: "功能 A", description: "描述 A" });
    const feature = db.getFeatures("demo")[0]!;
    const s1 = db.addStory("demo", {
      parentId: feature.id,
      title: "Story 1",
      description: "实现",
      acceptanceCriteria: ["AC1"],
      status: "ready",
      priority: 0,
    });
    db.addStory("demo", {
      parentId: feature.id,
      title: "Story 2",
      description: "文档",
      acceptanceCriteria: ["AC2"],
      status: "ready",
      priority: 1,
    });
    db.addPattern("demo", "复用模式示例");
    db.updateProjectSpec("demo", "# 项目规范\n\n- 测试通过");
    return { db, root, feature, s1 };
  }

  it("prd 输出包含结构化字段（meta、features、stories、tree）", () => {
    const { db } = createDb();
    const meta = db.getProjectMeta("demo");
    const prd = {
      ...meta,
      milestones: db.getMilestones("demo"),
      features: db.getFeatures("demo"),
      userStories: db.getStories("demo"),
      tree: db.getTree("demo"),
    };

    expect(prd.name).toBe("demo");
    expect(prd.branchName).toBe("main");
    expect(prd.description).toBe("测试项目");
    expect(prd.features).toHaveLength(1);
    expect(prd.features[0]).toMatchObject({
      id: expect.stringMatching(/^FT-/),
      title: "功能 A",
      description: "描述 A",
    });
    expect(prd.userStories).toHaveLength(2);
    expect(prd.userStories[0]).toMatchObject({
      id: expect.stringMatching(/^US-/),
      title: expect.any(String),
      acceptanceCriteria: expect.any(Array),
      status: expect.stringMatching(/^(draft|ready)$/),
      workType: expect.any(String),
    });
    expect(prd.tree).toHaveLength(1);
    expect(prd.tree[0]).toMatchObject({
      kind: "feature",
      id: expect.stringMatching(/^FT-/),
      children: expect.any(Array),
    });
  });

  it("tree 返回脑图树节点（含 kind、children）", () => {
    const { db } = createDb();
    const { tree } = { tree: db.getTree("demo") };

    expect(tree).toHaveLength(1);
    const root = tree[0]!;
    expect(root.kind).toBe("feature");
    expect(root.children.length).toBeGreaterThanOrEqual(2);
    const storyNode = root.children.find((c) => c.kind === "story");
    expect(storyNode).toMatchObject({
      kind: "story",
      id: expect.stringMatching(/^US-/),
      title: expect.any(String),
      passes: false,
      draft: expect.any(Boolean),
      blocked: expect.any(Boolean),
      children: [],
    });
  });

  it("next 返回下一个可执行 Story", () => {
    const { db, s1 } = createDb();
    const next = db.getNextStory("demo");

    expect(next).not.toBeNull();
    expect(next!.id).toBe(s1.id);
    expect(next!.status).toBe("ready");
    expect(next!.passes).toBe(false);
  });

  it("next-stories 支持 limit，返回可并行 Story 列表", () => {
    const { db } = createDb();
    const list = db.getNextStories("demo", 1);

    expect(list).toHaveLength(1);
    expect(list[0]!.claimedBy).toBeFalsy();

    const all = db.getNextStories("demo", 5);
    expect(all.length).toBe(2);
    expect(all.every((s) => s.status === "ready" && !s.passes)).toBe(true);
  });

  it("patterns 返回字符串数组", () => {
    const { db } = createDb();
    const patterns = db.getPatterns("demo");

    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns).toContain("复用模式示例");
  });

  it("spec 返回项目规范内容", () => {
    const { db } = createDb();
    const spec = db.getProjectSpec("demo");

    expect(spec).toMatchObject({
      content: expect.stringContaining("项目规范"),
      updatedAt: expect.any(String),
    });
  });

  it("spec-templates 返回内置模板列表（含 id、title、content）", () => {
    const { db } = createDb();
    const templates = db.getProjectSpecTemplates();

    expect(templates.length).toBeGreaterThanOrEqual(4);
    expect(templates[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      content: expect.any(String),
    });
    const ids = templates.map((t) => t.id);
    expect(ids).toContain("general");
    expect(ids).toContain("loop-agent");
  });

  it("getNextStory 与 getNextStories(limit=1) 结果一致", () => {
    const { db } = createDb();
    const stories = db.getStories("demo");
    expect(getNextStory(stories)?.id).toBe(db.getNextStories("demo", 1)[0]?.id);
  });
});

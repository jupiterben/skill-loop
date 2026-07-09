import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import { getProjectName } from "../../../../src/get-project-name.js";
import { getProjectFile } from "../../../../src/paths.js";

describe("项目初始化与状态查询", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createEmptyRoot() {
    const root = mkdtempSync(join(tmpdir(), "loop-init-status-"));
    roots.push(root);
    return root;
  }

  it("init 创建 project.json，写入 name/branchName/description/updatedAt", () => {
    const root = createEmptyRoot();
    const db = new LoopStateDb(root);
    db.upsertProject({
      name: "demo",
      branchName: "main",
      description: "测试项目",
    });

    const raw = JSON.parse(readFileSync(getProjectFile(root), "utf8")) as {
      name: string;
      branchName: string;
      description: string;
      updatedAt: string;
    };
    expect(raw.name).toBe("demo");
    expect(raw.branchName).toBe("main");
    expect(raw.description).toBe("测试项目");
    expect(raw.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("init 更新已有项目时刷新 updatedAt", async () => {
    const root = createEmptyRoot();
    const db = new LoopStateDb(root);
    db.upsertProject({
      name: "demo",
      branchName: "main",
      description: "v1",
    });
    const first = JSON.parse(readFileSync(getProjectFile(root), "utf8"))
      .updatedAt as string;

    await new Promise((resolve) => setTimeout(resolve, 5));

    db.upsertProject({
      name: "demo",
      branchName: "develop",
      description: "v2",
    });
    const second = JSON.parse(readFileSync(getProjectFile(root), "utf8")) as {
      branchName: string;
      description: string;
      updatedAt: string;
    };
    expect(second.branchName).toBe("develop");
    expect(second.description).toBe("v2");
    expect(second.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(second.updatedAt).not.toBe(first);
  });

  it("未初始化项目时 getProjectName 返回清晰错误", () => {
    const root = createEmptyRoot();
    const db = new LoopStateDb(root);
    expect(() => getProjectName(db)).toThrow(/项目未初始化/);
    expect(() => getProjectName(db)).toThrow(/loop init/);
  });

  it("status 返回项目元信息、Story 统计、patterns、activeRun 等聚合状态", () => {
    const root = createEmptyRoot();
    const db = new LoopStateDb(root);
    db.upsertProject({
      name: "demo",
      branchName: "main",
      description: "聚合测试",
    });
    db.addPattern("demo", "示例 pattern");
    db.addFeature("demo", { title: "F1", description: "" });
    const feature = db.getFeatures("demo")[0]!;
    db.addStory("demo", {
      parentId: feature.id,
      title: "S1",
      description: "",
      acceptanceCriteria: ["AC"],
      status: "ready",
    });
    db.startRun("demo", 1, "agent", "US-001", "w0");

    const status = db.getStatus("demo");
    expect(status.project).toBe("demo");
    expect(status.branchName).toBe("main");
    expect(status.description).toBe("聚合测试");
    expect(status.totalStories).toBe(1);
    expect(status.completedStories).toBe(0);
    expect(status.pendingStories).toBe(1);
    expect(status.readyStories).toBe(1);
    expect(status.totalFeatures).toBe(1);
    expect(status.isComplete).toBe(false);
    expect(status.nextStory?.id).toBe("US-001");
    expect(status.currentStory?.id).toBe("US-001");
    expect(status.patterns).toEqual(["示例 pattern"]);
    expect(status.activeRun?.storyId).toBe("US-001");
    expect(status.activeRuns?.[0]?.workerId).toBe("w0");
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";

describe("milestone targetDate and version", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createDb() {
    const root = mkdtempSync(join(tmpdir(), "loop-milestone-"));
    roots.push(root);
    const db = new LoopStateDb(root);
    db.upsertProject({
      name: "demo",
      branchName: "main",
      description: "测试",
    });
    return { db };
  }

  it("add-milestone 支持 targetDate 与 version", () => {
    const { db } = createDb();
    const milestone = db.addMilestone("demo", {
      title: "v1 发布",
      description: "",
      targetDate: "2026-12-31",
      version: "v1.0",
    });
    expect(milestone.targetDate).toBe("2026-12-31");
    expect(milestone.version).toBe("v1.0");
    expect(db.getMilestones("demo")[0]).toEqual(milestone);
  });

  it("update-milestone 可更新并清空可选字段", () => {
    const { db } = createDb();
    const created = db.addMilestone("demo", {
      title: "阶段一",
      description: "",
      targetDate: "2026-07-15",
      version: "v0.1",
    });
    const updated = db.updateMilestone("demo", created.id, {
      version: "v0.2",
      targetDate: "  ",
    });
    expect(updated.version).toBe("v0.2");
    expect(updated.targetDate).toBeUndefined();

    const cleared = db.updateMilestone("demo", created.id, { version: "" });
    expect(cleared.version).toBeUndefined();
  });

  it("拒绝无效 targetDate", () => {
    const { db } = createDb();
    expect(() =>
      db.addMilestone("demo", {
        title: "坏日期",
        description: "",
        targetDate: "2026-13-01",
      })
    ).toThrow(/有效日期/);
    expect(() =>
      db.addMilestone("demo", {
        title: "坏格式",
        description: "",
        targetDate: "07/15/2026",
      })
    ).toThrow(/ISO/);
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";
import { REQUIRED_WORK_TYPE_ERROR } from "./storyWorkType";

describe("workType 创建入口必填", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createDb() {
    const root = mkdtempSync(join(tmpdir(), "loop-worktype-required-"));
    roots.push(root);
    const db = new LoopStateDb(root);
    db.upsertProject({
      name: "demo",
      branchName: "main",
      description: "测试",
    });
    return db;
  }

  it("db.addStory 缺少 workType 时抛出明确错误", () => {
    const db = createDb();
    const ft = db.addFeature("demo", { title: "FT", description: "" });
    expect(() =>
      db.addStory("demo", {
        parentId: ft.id,
        title: "S",
        description: "",
        acceptanceCriteria: ["AC"],
      } as Parameters<LoopStateDb["addStory"]>[1])
    ).toThrow(REQUIRED_WORK_TYPE_ERROR);
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "../../../../src/db.js";

describe("updateProjectMeta", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createDb() {
    const root = mkdtempSync(join(tmpdir(), "loop-project-meta-"));
    roots.push(root);
    const db = new LoopStateDb(root);
    db.upsertProject({
      name: "demo",
      branchName: "main",
      description: "初始描述",
    });
    return { db, root };
  }

  it("更新 branchName、description 与 vision", () => {
    const { db } = createDb();
    const updated = db.updateProjectMeta("demo", {
      branchName: "develop",
      description: "新描述",
      vision: "成为最佳 Loop 工具",
    });
    expect(updated.branchName).toBe("develop");
    expect(updated.description).toBe("新描述");
    expect(updated.vision).toBe("成为最佳 Loop 工具");

    const status = db.getStatus("demo");
    expect(status.branchName).toBe("develop");
    expect(status.description).toBe("新描述");
    expect(status.vision).toBe("成为最佳 Loop 工具");

    const prd = db.getProjectMeta("demo");
    expect(prd.vision).toBe("成为最佳 Loop 工具");
  });

  it("清空 vision 时移除字段", () => {
    const { db } = createDb();
    db.updateProjectMeta("demo", { vision: "临时愿景" });
    const cleared = db.updateProjectMeta("demo", { vision: "  " });
    expect(cleared.vision).toBeUndefined();
    expect(db.getStatus("demo").vision).toBeUndefined();
  });

  it("branchName 不能为空", () => {
    const { db } = createDb();
    expect(() => db.updateProjectMeta("demo", { branchName: "  " })).toThrow(
      /branchName/
    );
  });
});

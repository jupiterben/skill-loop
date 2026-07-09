import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultFixStoryTitle,
  formatBugAc,
  hasBugAc,
  normalizeBugDescription,
} from "../../../../src/bug-ac.js";
import { LoopStateDb } from "../../../../src/db.js";

describe("缺陷报告与修复 Story", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) {
      rmSync(roots.pop()!, { recursive: true, force: true });
    }
  });

  function createDb() {
    const root = mkdtempSync(join(tmpdir(), "loop-bug-report-"));
    roots.push(root);
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", branchName: "main", description: "" });
    db.addFeature("demo", { title: "F1", description: "" });
    const feature = db.getFeatures("demo")[0]!;
    const story = db.addStory("demo", {
      parentId: feature.id,
      title: "源 Story",
      description: "",
      acceptanceCriteria: ["AC"],
      status: "ready",
    });
    return { db, feature, story };
  }

  it("formatBugAc 为未完成 Story 加「不应出现：」前缀", () => {
    expect(formatBugAc("拖拽后弹回", false)).toBe("不应出现：拖拽后弹回");
    expect(formatBugAc("不应出现：已有", false)).toBe("不应出现：已有");
  });

  it("formatBugAc 为已完成 Story 加「不应再出现：」前缀", () => {
    expect(formatBugAc("连线消失", true)).toBe("不应再出现：连线消失");
    expect(formatBugAc("不应再出现：已有", true)).toBe("不应再出现：已有");
  });

  it("defaultFixStoryTitle 从描述生成修复标题", () => {
    expect(defaultFixStoryTitle("连线消失")).toBe("修复：连线消失");
    expect(defaultFixStoryTitle("不应再出现：连线消失")).toBe("修复：连线消失");
  });

  it("normalizeBugDescription 拒绝空描述", () => {
    expect(() => normalizeBugDescription("  ")).toThrow(/不能为空/);
  });

  it("hasBugAc 检测重复 Bug 反例", () => {
    const ac = ["不应出现：拖拽后弹回"];
    expect(hasBugAc(ac, "拖拽后弹回")).toBe(true);
    expect(hasBugAc(ac, "其他缺陷")).toBe(false);
  });

  it("未完成 Story 上报缺陷时追加不应出现反例 AC", () => {
    const { db, story } = createDb();

    const result = db.reportBug("demo", story.id, "拖拽后弹回");

    expect(result.action).toBe("appended");
    expect(result.bugAc).toBe("不应出现：拖拽后弹回");
    expect(result.story.acceptanceCriteria).toContain("不应出现：拖拽后弹回");
    expect(result.createdStory).toBeUndefined();
    expect(result.progressEntry?.summary).toContain("追加 Bug 反例 AC");
  });

  it("未完成 Story 上报缺陷支持 change-note 与 --ready", () => {
    const { db, story } = createDb();

    const result = db.reportBug("demo", story.id, "按钮无响应", {
      ready: true,
      changeNote: "测试发现回归",
    });

    expect(result.story.status).toBe("ready");
    expect(result.progressEntry?.summary).toContain("测试发现回归");
  });

  it("重复 Bug 反例会拒绝追加", () => {
    const { db, story } = createDb();
    db.reportBug("demo", story.id, "拖拽后弹回");

    expect(() => db.reportBug("demo", story.id, "拖拽后弹回")).toThrow(
      /已存在相同或相近/
    );
  });

  it("已完成 Story 上报缺陷时自动创建修复 Story", () => {
    const { db, feature, story } = createDb();
    db.completeStoryWithProgress("demo", story.id, { summary: "首轮完成" });

    const result = db.reportBug("demo", story.id, "连线消失");

    expect(result.action).toBe("created");
    expect(result.bugAc).toBe("不应再出现：连线消失");
    expect(result.createdStory).toBeDefined();
    expect(result.createdStory!.title).toBe("修复：连线消失");
    expect(result.createdStory!.acceptanceCriteria).toContain(
      "不应再出现：连线消失"
    );
    expect(result.createdStory!.parentId).toBe(feature.id);
    expect(result.createdStory!.status).toBe("draft");
    expect(result.progressEntry?.summary).toContain(story.id);
  });

  it("已完成 Story 修复 Story 支持自定义标题、change-note 与 ready", () => {
    const { db, story } = createDb();
    db.completeStoryWithProgress("demo", story.id, { summary: "完成" });

    const result = db.reportBug("demo", story.id, "空态按钮失效", {
      fixTitle: "修复空态交互",
      changeNote: "E2E 回归",
      ready: true,
    });

    expect(result.createdStory!.title).toBe("修复空态交互");
    expect(result.createdStory!.status).toBe("ready");
    expect(result.progressEntry?.summary).toBe("E2E 回归");
  });
});

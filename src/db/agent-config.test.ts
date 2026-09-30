import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "./db.js";
import { selectAgent, normalizeAgentModel } from "../domain/agent-config.js";

describe("project Agent configurations", () => {
  let root: string;
  let db: LoopStateDb;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "loop-agent-config-"));
    db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", description: "", branchName: "main" });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const draft = { name: "Codex review", tool: "codex", model: "test-model", enabled: true };
  const story = () => db.addStory("demo", {
    title: "Example", description: "", workType: "testing", status: "draft", acceptanceCriteria: ["AC"],
  });

  it("starts empty, persists independently per project, and never reuses deleted IDs", () => {
    expect(db.getAgentConfig("demo").profiles).toEqual([]);
    const a = db.saveAgentProfile("demo", draft);
    expect(new LoopStateDb(root).getAgentConfig("demo").profiles).toEqual([a]);
    const other = new LoopStateDb(join(root, "other"));
    other.upsertProject({ name: "demo", branchName: "main", description: "" });
    expect(other.getAgentConfig("demo").profiles).toEqual([]);
    db.deleteAgentProfile("demo", a.id);
    expect(db.saveAgentProfile("demo", draft).id).not.toBe(a.id);
  });

  it("updates a profile without changing its ID and can clear the model", () => {
    const a = db.saveAgentProfile("demo", draft);
    expect(db.saveAgentProfile("demo", { ...a, name: "New", model: null }, a.id))
      .toMatchObject({ id: a.id, name: "New", model: null });
    expect(db.getAgentConfig("demo").profiles).toHaveLength(1);
  });

  it("rejects invalid updates without overwriting the file", () => {
    const a = db.saveAgentProfile("demo", draft);
    const path = join(root, "loop-data", "agent-config.json");
    const original = readFileSync(path, "utf8");
    for (const patch of [{ name: "" }, { tool: "unknown" }, { enabled: "false" }, { model: "x & echo secret" }]) {
      expect(() => db.saveAgentProfile("demo", { ...a, ...patch }, a.id)).toThrow();
      expect(readFileSync(path, "utf8")).toBe(original);
    }
  });

  it("rejects damaged configuration instead of silently resetting it", () => {
    const path = join(root, "loop-data", "agent-config.json");
    writeFileSync(path, "{invalid");
    expect(() => db.getAgentConfig("demo")).toThrow(/agent-config.json/);
    expect(() => db.saveAgentProfile("demo", draft)).toThrow();
    expect(readFileSync(path, "utf8")).toBe("{invalid");
  });

  it("protects default and referenced profiles from deletion", () => {
    const a = db.saveAgentProfile("demo", draft);
    db.setDefaultAgentProfile("demo", a.id);
    expect(() => db.deleteAgentProfile("demo", a.id)).toThrow(/default/);
    expect(() => db.saveAgentProfile("demo", { ...a, enabled: false }, a.id)).toThrow(/default/);
    db.setDefaultAgentProfile("demo", null);
    const s = story();
    db.setStoryAgentProfile("demo", s.id, a.id);
    expect(() => db.deleteAgentProfile("demo", a.id)).toThrow(s.id);
    db.setStoryAgentProfile("demo", s.id, null);
    expect(db.deleteAgentProfile("demo", a.id).profiles).toEqual([]);
  });

  it("assigns profiles without confirming or completing a Story", () => {
    const a = db.saveAgentProfile("demo", draft);
    const s = story();
    db.setStoryPreferredTool("demo", s.id, "claude");
    const assigned = db.setStoryAgentProfile("demo", s.id, a.id);
    expect(assigned).toMatchObject({ agentProfileId: a.id, preferredTool: null, status: "draft", passes: false });
    expect(db.setStoryPreferredTool("demo", s.id, null).agentProfileId).toBeNull();
    expect(() => db.setStoryAgentProfile("demo", s.id, "AG-999")).toThrow();
    db.saveAgentProfile("demo", { ...a, enabled: false }, a.id);
    expect(() => db.setStoryAgentProfile("demo", s.id, a.id)).toThrow(/disabled/);
  });

  it("honors explicit launch > Story > project default and rejects conflicting choices", () => {
    const a = db.saveAgentProfile("demo", draft);
    const b = db.saveAgentProfile("demo", { ...draft, name: "Writer", model: "other-model" });
    const config = db.setDefaultAgentProfile("demo", a.id);
    expect(selectAgent(config).profile?.id).toBe(a.id);
    expect(selectAgent(config, {}, { agentProfileId: b.id }).profile?.id).toBe(b.id);
    expect(selectAgent(config, { agentProfileId: a.id }, { agentProfileId: b.id }).profile?.id).toBe(a.id);
    expect(selectAgent(config, { tool: "agent" }, { agentProfileId: b.id })).toEqual({ tool: "agent" });
    expect(selectAgent(config, {}, { preferredTool: "claude" })).toEqual({ tool: "claude" });
    expect(() => selectAgent(config, { agentProfileId: a.id, tool: "codex" })).toThrow();
    expect(() => selectAgent(config, { agentProfileId: "AG-999" })).toThrow();
  });

  it.each(["model;cmd", "%TOKEN%", "foo\nbar", "$(pwd)", '--model', 'foo"bar', "foo bar"])(
    "rejects shell expressions and ambiguous model IDs: %s",
    (model) => expect(() => normalizeAgentModel(model)).toThrow()
  );
});

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LoopStateDb } from "./db.js";
import {
  effectiveExecutable,
  effectiveTimeoutMs,
  normalizeAgentModel,
  normalizeArgs,
  normalizeEnvRefs,
  normalizeTimeoutMs,
  selectAgent,
  DEFAULT_AGENT_TIMEOUT_MS,
} from "../domain/agent-config.js";

describe("project Agent configurations", () => {
  let root: string;
  let db: LoopStateDb;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "loop-agent-config-"));
    db = new LoopStateDb(root);
    db.upsertProject({ name: "demo", description: "", branchName: "main" });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const draft = {
    name: "Codex review", adapter: "codex", model: "test-model", enabled: true,
  };
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

  it("normalizes the full schema: adapter, executable, args, timeoutMs, envRefs", () => {
    const profile = db.saveAgentProfile("demo", {
      name: "Local codex",
      adapter: "codex",
      executable: " C:\\tools\\codex.cmd ",
      model: "gpt-6",
      args: [" --verbose ", "--sandbox on"],
      timeoutMs: 120_000,
      envRefs: ["OPENAI_API_KEY"],
      enabled: true,
    });
    expect(profile).toMatchObject({
      id: "AG-001",
      adapter: "codex",
      executable: "C:\\tools\\codex.cmd",
      args: ["--verbose", "--sandbox on"],
      timeoutMs: 120_000,
      envRefs: ["OPENAI_API_KEY"],
    });
    expect(effectiveExecutable(profile)).toBe("C:\\tools\\codex.cmd");
    expect(effectiveTimeoutMs(profile)).toBe(120_000);
    expect(effectiveExecutable(db.saveAgentProfile("demo", {
      name: "Default cmd", adapter: "claude",
    }))).toBe("claude");
    expect(effectiveTimeoutMs(profile)).not.toBe(DEFAULT_AGENT_TIMEOUT_MS);
  });

  it("reads legacy `tool` keys as `adapter` for backward compatibility", () => {
    const a = db.saveAgentProfile("demo", { name: "Legacy", tool: "claude", model: null });
    expect(a).toMatchObject({ adapter: "claude" });
    expect(db.getAgentConfig("demo").profiles[0]?.adapter).toBe("claude");
  });

  it("updates a profile without changing its ID and can clear optional fields", () => {
    const a = db.saveAgentProfile("demo", { ...draft, args: ["--x"], executable: "codex.cmd" });
    const updated = db.saveAgentProfile("demo", {
      ...a, name: "New", model: null, args: [], executable: null,
    }, a.id);
    expect(updated).toMatchObject({
      id: a.id, name: "New", model: null, args: [], executable: null,
    });
    expect(db.getAgentConfig("demo").profiles).toHaveLength(1);
  });

  it("rejects invalid updates without overwriting the file", () => {
    const a = db.saveAgentProfile("demo", draft);
    const path = join(root, "loop-data", "agent-config.json");
    const original = readFileSync(path, "utf8");
    const invalid = [
      { name: "" },
      { adapter: "unknown" },
      { enabled: "false" },
      { model: "x & echo secret" },
      { executable: "" },
      { executable: "x\ny" },
      { args: "not-an-array" },
      { args: ["ok", 3] },
      { timeoutMs: 0 },
      { timeoutMs: -5 },
      { timeoutMs: "later" },
      { envRefs: "OPENAI_API_KEY" },
      { envRefs: ["LOOP_PROJECT_ROOT"] },
      { envRefs: ["BAD NAME"] },
      { envRefs: ["A", "a"] },
    ];
    for (const patch of invalid) {
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

  it("rejects dangling default references in a hand-edited file", () => {
    const path = join(root, "loop-data", "agent-config.json");
    writeFileSync(path, JSON.stringify({
      schemaVersion: 1, nextId: 2, defaultProfileId: "AG-999",
      profiles: [{ id: "AG-001", name: "One", adapter: "claude", enabled: true }],
    }));
    expect(() => db.getAgentConfig("demo")).toThrow(/Default profile not found/);
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

  it("resolves config in order: --agent-profile > --tool > Story > project default > auto", () => {
    const a = db.saveAgentProfile("demo", draft);
    const b = db.saveAgentProfile("demo", { ...draft, name: "Writer", model: "other-model" });
    const config = db.setDefaultAgentProfile("demo", a.id);
    expect(selectAgent(config).profile?.id).toBe(a.id);
    expect(selectAgent(config, {}, { agentProfileId: b.id }).profile?.id).toBe(b.id);
    expect(selectAgent(config, {}, { preferredTool: "claude" })).toEqual({ tool: "claude" });
    expect(selectAgent(config, { agentProfileId: a.id }, { agentProfileId: b.id }).profile?.id).toBe(a.id);
    expect(selectAgent(config, { tool: "agent" }, { agentProfileId: b.id })).toEqual({ tool: "agent" });
    expect(selectAgent(config, { tool: "agent" }, { preferredTool: "codex" })).toEqual({ tool: "agent" });
    expect(selectAgent({ ...config, defaultProfileId: null }, {})).toEqual({});
    expect(() => selectAgent(config, { agentProfileId: a.id, tool: "codex" })).toThrow(/cannot be used together/);
    expect(() => selectAgent(config, { agentProfileId: "AG-999" })).toThrow();
    expect(() => selectAgent(config, { tool: "codex" }, { agentProfileId: b.id })).not.toThrow();
  });

  it("merges local overrides above shared config and cleans them up on delete", () => {
    const a = db.saveAgentProfile("demo", { ...draft, executable: null, args: [] });
    db.setLocalAgentOverride("demo", a.id, {
      executable: "C:\\local\\codex.cmd", timeoutMs: 60_000, envRefs: ["OPENAI_API_KEY"],
    });
    const effective = db.getEffectiveAgentConfig("demo").profiles.find((p) => p.id === a.id)!;
    expect(effective).toMatchObject({
      executable: "C:\\local\\codex.cmd",
      timeoutMs: 60_000,
      envRefs: ["OPENAI_API_KEY"],
      model: "test-model",
    });
    expect(db.getAgentConfig("demo").profiles[0]?.executable).toBeNull();
    expect(() => db.setLocalAgentOverride("demo", "AG-999", { executable: "x" })).toThrow();
    expect(() => db.setLocalAgentOverride("demo", a.id, { envRefs: ["LOOP_WORKER_ID"] })).toThrow();
    db.clearLocalAgentOverride("demo", a.id);
    expect(db.getEffectiveAgentConfig("demo").profiles.find((p) => p.id === a.id)?.executable).toBeNull();
    db.setLocalAgentOverride("demo", a.id, { executable: "C:\\local\\codex.cmd" });
    db.deleteAgentProfile("demo", a.id);
    expect(db.getLocalAgentConfig("demo").overrides).toEqual({});
  });

  it.each(["model;cmd", "%TOKEN%", "foo\nbar", "$(pwd)", '--model', 'foo"bar', "foo bar"])(
    "rejects shell expressions and ambiguous model IDs: %s",
    (model) => expect(() => normalizeAgentModel(model)).toThrow()
  );
});

describe("Agent config normalizers", () => {
  it("validates args arrays strictly", () => {
    expect(normalizeArgs([" --a ", "b"])).toEqual(["--a", "b"]);
    expect(normalizeArgs(undefined)).toEqual([]);
    expect(() => normalizeArgs("--a")).toThrow(/array/);
    expect(() => normalizeArgs([3])).toThrow(/string/);
    expect(() => normalizeArgs([""])).toThrow(/empty/);
  });

  it("validates timeoutMs strictly", () => {
    expect(normalizeTimeoutMs(1000)).toBe(1000);
    expect(normalizeTimeoutMs(null)).toBeNull();
    expect(() => normalizeTimeoutMs(0)).toThrow();
    expect(() => normalizeTimeoutMs(1.5)).toThrow();
    expect(() => normalizeTimeoutMs(NaN)).toThrow();
  });

  it("validates envRefs as names only and never allows scheduling vars", () => {
    expect(normalizeEnvRefs(["OPENAI_API_KEY"])).toEqual(["OPENAI_API_KEY"]);
    expect(normalizeEnvRefs(undefined)).toEqual([]);
    expect(() => normalizeEnvRefs("OPENAI_API_KEY")).toThrow(/array/);
    expect(() => normalizeEnvRefs(["LOOP_PROJECT_ROOT"])).toThrow(/reserved/);
    expect(() => normalizeEnvRefs(["LOOP_WORKER_ID"])).toThrow(/reserved/);
    expect(() => normalizeEnvRefs(["LOOP_CLAIMED_STORY_ID"])).toThrow(/reserved/);
    expect(() => normalizeEnvRefs(["bad name"])).toThrow(/name/);
    expect(() => normalizeEnvRefs(["A", "a"])).toThrow(/Duplicate/);
  });
});

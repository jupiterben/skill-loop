import { describe, expect, it } from "vitest";
import { emptyAgentConfig, type AgentConfig } from "../../../../domain/agent-config";
import { agentSelectionLabel, agentSelectionOptions, agentSelectionValue } from "./agentSelection";
import { buildStartLoopRunPayload } from "../loop-run-control/loopRunControlView";
import { normalizeDashboard } from "../../lib/normalize";

const config: AgentConfig = {
  ...emptyAgentConfig(),
  nextId: 2,
  profiles: [{
    id: "AG-001", name: "Codex reviewer", adapter: "codex", executable: null,
    model: "test-model", args: [], timeoutMs: null, envRefs: [], enabled: true,
  }],
};

describe("Agent selection in the Dashboard", () => {
  it("shows named profiles with CLI and model, and disables inactive ones", () => {
    expect(agentSelectionOptions(config, ["codex"])).toContainEqual({
      value: "profile:AG-001", label: "Codex reviewer (codex / test-model)", disabled: false,
    });
    expect(agentSelectionOptions({
      ...config, profiles: [{ ...config.profiles[0]!, enabled: false }],
    }, ["codex"]).find((o) => o.value === "profile:AG-001")).toHaveProperty("disabled", true);
  });
  it("builds a profile-only launch payload or an inherited launch", () => {
    expect(buildStartLoopRunPayload({
      agentProfileId: "AG-001", workers: 1, untilStop: false, maxIterations: 1,
    })).toEqual({ agentProfileId: "AG-001", workers: 1, untilStop: false, maxIterations: 1 });
    expect(buildStartLoopRunPayload({ workers: 1, untilStop: true }))
      .toEqual({ workers: 1, untilStop: true });
    expect(() => buildStartLoopRunPayload({
      agentProfileId: "AG-001", tool: "codex", workers: 1, untilStop: true,
    })).toThrow();
  });
  it("preserves stored Story profile choices and config across refreshes", () => {
    const result = normalizeDashboard({
      agentConfig: config,
      userStories: [{ id: "US-001", agentProfileId: "AG-001" }],
    });
    expect(result.agentConfig).toEqual(config);
    expect(agentSelectionValue(result.userStories[0]!)).toBe("profile:AG-001");
    expect(agentSelectionValue({ preferredTool: "codex" })).toBe("tool:codex");
    expect(normalizeDashboard({}).agentConfig).toEqual(emptyAgentConfig());
  });
  it("only offers installed commands and profiles without duplicating aliases", () => {
    const values = agentSelectionOptions(config, ["agent", "codex"]).map((o) => o.value);
    expect(values).toEqual(["", "profile:AG-001", "tool:agent", "tool:codex"]);
    expect(agentSelectionOptions(config, ["agent"]).map((o) => o.value)).toEqual(["", "tool:agent"]);
    expect(config.profiles).toHaveLength(1);
    expect(agentSelectionLabel("profile:AG-001", config, ["agent"])).toContain("未安装");
  });
  it("never falls back to all supported tools when discovery is empty or missing", () => {
    expect(agentSelectionOptions(config, [])).toEqual([{ value: "", label: "按 Story / 项目默认" }]);
    expect(agentSelectionOptions(config)).toHaveLength(1);
    expect(normalizeDashboard({}).installedAgentTools).toEqual([]);
    expect(normalizeDashboard({ installedAgentTools: ["codex", "cursor", "invalid"] }).installedAgentTools)
      .toEqual(["codex"]);
  });
});

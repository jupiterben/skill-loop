import { agentProfileLabel, type AgentConfig } from "../../../../domain/agent-config";
import { AGENT_CLI_COMMANDS, isAgentToolInstalled, type RunTool } from "../../../../domain/run-tool";

export function agentSelectionOptions(config: AgentConfig, installedTools: readonly RunTool[] = [], legacyOnly = false) {
  const tools = AGENT_CLI_COMMANDS.filter((tool) => installedTools.includes(tool) &&
    (!legacyOnly || ["agent", "claude", "codex"].includes(tool)));
  return [
    { value: "", label: "按 Story / 项目默认" },
    ...config.profiles.filter((p) => isAgentToolInstalled(p.adapter, installedTools)).map((p) => ({
      value: `profile:${p.id}`,
      label: agentProfileLabel(p) + (p.enabled ? "" : " · 已停用"),
      disabled: !p.enabled,
    })),
    ...tools.map((tool) => ({ value: `tool:${tool}`, label: `${tool} · CLI 默认配置` })),
  ];
}

export function agentSelectionLabel(
  value: string,
  config: AgentConfig,
  installedTools: readonly RunTool[]
): string {
  if (value.startsWith("profile:")) {
    const profile = config.profiles.find((p) => p.id === value.slice(8));
    if (profile) return agentProfileLabel(profile) +
      (isAgentToolInstalled(profile.adapter, installedTools) ? "" : " · 未安装");
  }
  if (value.startsWith("tool:")) {
    const tool = value.slice(5) as RunTool;
    return `${tool} · CLI 默认配置${isAgentToolInstalled(tool, installedTools) ? "" : " · 未安装"}`;
  }
  return "按 Story / 项目默认";
}

export function agentSelectionValue(story: { agentProfileId?: string | null; preferredTool?: string | null }): string {
  if (story.agentProfileId) return `profile:${story.agentProfileId}`;
  if (story.preferredTool) return `tool:${story.preferredTool}`;
  return "";
}

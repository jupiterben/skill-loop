import { RUN_TOOLS, type RunTool } from "./run-tool.js";

/**
 * 项目级 Agent CLI 配置。
 *
 * 共享（可入库）配置保存在 loop-data/agent-config.json；本机路径与凭证名称等
 * 机器相关覆盖保存在不入库的 .loop-status/agent-config.local.json，读取时按
 * profile ID 合并：本机覆盖 > 共享配置 > 适配器默认。
 */
export interface AgentProfile {
  id: string;
  name: string;
  /** 已有工具适配器（对应 CLI 命令），区别于旧 `--tool` 启动参数 */
  adapter: RunTool;
  /** 自定义命令路径；null = 使用适配器默认命令 */
  executable: string | null;
  model: string | null;
  args: string[];
  /** 单次调用超时（毫秒）；null = 使用适配器默认 */
  timeoutMs: number | null;
  /** 需要透传的环境变量名称映射（只存名称，不存密钥值） */
  envRefs: string[];
  enabled: boolean;
}

export interface AgentProfileOverride {
  executable?: string | null;
  model?: string | null;
  args?: string[];
  timeoutMs?: number | null;
  envRefs?: string[];
}

export interface AgentConfig {
  schemaVersion: 1;
  nextId: number;
  defaultProfileId: string | null;
  profiles: AgentProfile[];
}

export interface LocalAgentConfig {
  schemaVersion: 1;
  overrides: Record<string, AgentProfileOverride>;
}

export interface AgentChoice {
  agentProfileId?: string;
  tool?: string;
}

export interface AgentStoryPreference {
  agentProfileId?: string | null;
  preferredTool?: string | null;
}

export const AGENT_CONFIG_SCHEMA_VERSION = 1;

export const DEFAULT_AGENT_TIMEOUT_MS = 3_600_000;
export const MAX_TIMEOUT_MS = 86_400_000;

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_ENV_PREFIX = "LOOP_";

export function isReservedEnvName(name: string): boolean {
  return name.toUpperCase().startsWith(RESERVED_ENV_PREFIX);
}

export function defaultExecutable(adapter: RunTool): string {
  return adapter;
}

export function emptyAgentConfig(): AgentConfig {
  return { schemaVersion: 1, nextId: 1, defaultProfileId: null, profiles: [] };
}

export function emptyLocalAgentConfig(): LocalAgentConfig {
  return { schemaVersion: 1, overrides: {} };
}

export function normalizeAgentModel(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("model must be a string");
  const model = value.trim();
  if (!model) return null;
  // Model IDs are argv values, never shell expressions.
  if (model.length > 200 || !/^[a-zA-Z0-9][a-zA-Z0-9._/:@+-]*$/.test(model)) {
    throw new Error("model contains unsupported characters");
  }
  return model;
}

export function normalizeExecutable(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error("executable must be a string");
  const executable = value.trim();
  if (!executable) throw new Error("executable must not be empty");
  if (executable.length > 500 || /[\r\n\0]/.test(executable)) {
    throw new Error("executable contains unsupported characters");
  }
  return executable;
}

export function normalizeArgs(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("args must be an array of strings");
  return value.map((item, index) => {
    if (typeof item !== "string") throw new Error(`args[${index}] must be a string`);
    const arg = item.trim();
    if (!arg) throw new Error(`args[${index}] must not be empty`);
    if (/[\r\n\0]/.test(arg)) throw new Error(`args[${index}] contains unsupported characters`);
    return arg;
  });
}

export function normalizeTimeoutMs(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("timeoutMs must be a number");
  }
  if (!Number.isInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
    throw new Error(`timeoutMs must be an integer between 1 and ${MAX_TIMEOUT_MS}`);
  }
  return value;
}

export function normalizeEnvRefs(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("envRefs must be an array of strings");
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") throw new Error("envRefs must be an array of strings");
    const name = item.trim();
    if (!name) throw new Error("envRefs must not contain empty names");
    if (!ENV_NAME_PATTERN.test(name)) throw new Error(`Invalid environment variable name: ${name}`);
    if (isReservedEnvName(name)) {
      throw new Error(`Cannot override reserved environment variable: ${name}`);
    }
    const upper = name.toUpperCase();
    if (seen.has(upper)) throw new Error(`Duplicate environment variable: ${name}`);
    seen.add(upper);
    names.push(name);
  }
  return names;
}

export function parseAgentProfile(input: unknown, id: string): AgentProfile {
  if (!input || typeof input !== "object") throw new Error("Invalid agent profile");
  const row = input as Record<string, unknown>;
  if (!/^AG-\d+$/.test(id)) throw new Error("Invalid agent profile ID");
  if (typeof row.name !== "string" || !row.name.trim() || row.name.length > 100) {
    throw new Error("Agent name must contain 1-100 characters");
  }
  // `adapter` 为规范字段；`tool` 为历史别名，读取时向后兼容。
  const adapter = row.adapter ?? row.tool;
  if (!RUN_TOOLS.includes(adapter as RunTool)) throw new Error("Invalid agent adapter");
  if (row.enabled !== undefined && typeof row.enabled !== "boolean") {
    throw new Error("enabled must be a boolean");
  }
  return {
    id,
    name: row.name.trim(),
    adapter: adapter as RunTool,
    executable: normalizeExecutable(row.executable),
    model: normalizeAgentModel(row.model),
    args: normalizeArgs(row.args),
    timeoutMs: normalizeTimeoutMs(row.timeoutMs),
    envRefs: normalizeEnvRefs(row.envRefs),
    enabled: row.enabled !== false,
  };
}

export function parseAgentProfileOverride(
  input: unknown,
  id: string
): AgentProfileOverride {
  if (!input || typeof input !== "object") throw new Error("Invalid local override");
  const row = input as Record<string, unknown>;
  if (!/^AG-\d+$/.test(id)) throw new Error("Invalid agent profile ID");
  const override: AgentProfileOverride = {};
  if (row.executable !== undefined) override.executable = normalizeExecutable(row.executable);
  if (row.model !== undefined) override.model = normalizeAgentModel(row.model);
  if (row.args !== undefined) override.args = normalizeArgs(row.args);
  if (row.timeoutMs !== undefined) override.timeoutMs = normalizeTimeoutMs(row.timeoutMs);
  if (row.envRefs !== undefined) override.envRefs = normalizeEnvRefs(row.envRefs);
  return override;
}

export function findAgentProfile(config: AgentConfig, id: string): AgentProfile | undefined {
  return config.profiles.find((p) => p.id === id);
}

export function requireAgentProfile(config: AgentConfig, id: string): AgentProfile {
  const profile = findAgentProfile(config, id);
  if (!profile) throw new Error(`Agent configuration not found: ${id}`);
  if (!profile.enabled) throw new Error(`Agent configuration is disabled: ${profile.name}`);
  return profile;
}

/**
 * 配置选择顺序：显式 --agent-profile → 显式 --tool → Story 偏好（绑定 profile 或
 * preferredTool）→ 项目默认 profile → 自动探测（返回空，由调用方探测）。
 *
 * 显式选择不可用（未知 / 已停用）时抛错，绝不静默换工具。
 */
export function selectAgent(
  config: AgentConfig,
  choice: AgentChoice = {},
  story?: AgentStoryPreference
): { tool?: string; profile?: AgentProfile } {
  const id = choice.agentProfileId?.trim();
  const tool = choice.tool?.trim();
  if (id && tool) throw new Error("--agent-profile and --tool cannot be used together");
  if (id) {
    const profile = requireAgentProfile(config, id);
    return { tool: profile.adapter, profile };
  }
  if (tool) return { tool };
  if (story?.agentProfileId) {
    const profile = requireAgentProfile(config, story.agentProfileId);
    return { tool: profile.adapter, profile };
  }
  if (story?.preferredTool) return { tool: story.preferredTool };
  if (config.defaultProfileId) {
    const profile = requireAgentProfile(config, config.defaultProfileId);
    return { tool: profile.adapter, profile };
  }
  return {};
}

export function applyProfileOverride(
  profile: AgentProfile,
  override?: AgentProfileOverride
): AgentProfile {
  if (!override) return profile;
  return {
    ...profile,
    executable:
      override.executable !== undefined ? normalizeExecutable(override.executable) : profile.executable,
    model: override.model !== undefined ? normalizeAgentModel(override.model) : profile.model,
    args: override.args !== undefined ? normalizeArgs(override.args) : profile.args,
    timeoutMs:
      override.timeoutMs !== undefined ? normalizeTimeoutMs(override.timeoutMs) : profile.timeoutMs,
    envRefs: override.envRefs !== undefined ? normalizeEnvRefs(override.envRefs) : profile.envRefs,
  };
}

export function effectiveExecutable(profile: AgentProfile): string {
  return profile.executable ?? defaultExecutable(profile.adapter);
}

export function effectiveTimeoutMs(profile: AgentProfile): number {
  return profile.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
}

export function agentProfileLabel(profile: AgentProfile): string {
  return `${profile.name} (${profile.adapter}${profile.model ? ` / ${profile.model}` : ""})`;
}

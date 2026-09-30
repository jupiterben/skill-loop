import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  applyProfileOverride,
  emptyAgentConfig,
  emptyLocalAgentConfig,
  findAgentProfile,
  parseAgentProfile,
  parseAgentProfileOverride,
  type AgentConfig,
  type LocalAgentConfig,
} from "../domain/agent-config.js";
import { getStateDir, getStatusDir } from "./paths.js";

function sharedPath(root: string): string {
  return join(getStateDir(root), "agent-config.json");
}

function localPath(root: string): string {
  return join(getStatusDir(root), "agent-config.local.json");
}

function writeAtomic(path: string, content: string): void {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, content, "utf8");
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

export function readAgentConfig(root: string): AgentConfig {
  const path = sharedPath(root);
  if (!existsSync(path)) return emptyAgentConfig();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (raw.schemaVersion !== 1 || !Array.isArray(raw.profiles) ||
        !Number.isSafeInteger(raw.nextId) || raw.nextId < 1 ||
        (raw.defaultProfileId !== null && typeof raw.defaultProfileId !== "string")) {
      throw new Error("Invalid schema");
    }
    const config: AgentConfig = {
      schemaVersion: 1,
      nextId: raw.nextId,
      defaultProfileId: raw.defaultProfileId,
      profiles: raw.profiles.map((p: { id: string }) => parseAgentProfile(p, p.id)),
    };
    const ids = config.profiles.map((p) => p.id);
    if (new Set(ids).size !== ids.length ||
        config.profiles.some((p) => Number(p.id.slice(3)) >= config.nextId)) {
      throw new Error("Invalid profile IDs");
    }
    if (config.defaultProfileId && !findAgentProfile(config, config.defaultProfileId)) {
      throw new Error(`Default profile not found: ${config.defaultProfileId}`);
    }
    return config;
  } catch (error) {
    throw new Error(`Invalid agent-config.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function writeAgentConfig(root: string, config: AgentConfig): void {
  writeAtomic(sharedPath(root), JSON.stringify(config, null, 2) + "\n");
}

export function readLocalAgentConfig(root: string): LocalAgentConfig {
  const path = localPath(root);
  if (!existsSync(path)) return emptyLocalAgentConfig();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (raw.schemaVersion !== 1 || typeof raw !== "object" || raw === null) {
      throw new Error("Invalid schema");
    }
    const overridesRaw = raw.overrides ?? {};
    if (typeof overridesRaw !== "object" || Array.isArray(overridesRaw) || overridesRaw === null) {
      throw new Error("Invalid overrides");
    }
    const overrides: LocalAgentConfig["overrides"] = {};
    for (const [id, value] of Object.entries(overridesRaw)) {
      overrides[id] = parseAgentProfileOverride(value, id);
    }
    return { schemaVersion: 1, overrides };
  } catch (error) {
    throw new Error(
      `Invalid agent-config.local.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function writeLocalAgentConfig(root: string, config: LocalAgentConfig): void {
  writeAtomic(localPath(root), JSON.stringify(config, null, 2) + "\n");
}

/** 共享配置 + 本机覆盖合并后的有效配置（不含适配器默认的补齐，仅在调用时应用）。 */
export function readEffectiveAgentConfig(root: string): AgentConfig {
  const shared = readAgentConfig(root);
  const local = readLocalAgentConfig(root);
  return {
    ...shared,
    profiles: shared.profiles.map((p) => applyProfileOverride(p, local.overrides[p.id])),
  };
}

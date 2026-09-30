import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { normalizeAgentModel, type AgentProfile } from "../domain/agent-config.js";
import type { RunTool } from "../domain/run-tool.js";

export interface AgentModel {
  id: string;
  name: string;
}

export interface AgentModelCatalog {
  models: AgentModel[];
  warning?: string;
}

export function parseCodexModels(value: unknown): AgentModel[] {
  if (!Array.isArray(value)) throw new Error("Invalid model list");
  const models = new Map<string, AgentModel>();
  for (const item of value) {
    if (!item || typeof item !== "object" || item.hidden === true) continue;
    try {
      const id = normalizeAgentModel(item.model);
      if (!id) continue;
      const name = typeof item.displayName === "string" ? item.displayName : id;
      models.set(id, { id, name });
    } catch {
      // Do not offer malformed IDs that the execution layer cannot accept.
    }
  }
  return [...models.values()];
}

export function readCodexModels(projectRoot: string): Promise<AgentModel[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", ["app-server", "--stdio"], {
      cwd: projectRoot,
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let settled = false;
    let byteCount = 0;
    let pages = 0;
    const models: AgentModel[] = [];
    const cursors = new Set<string>();
    const lines = createInterface({ input: child.stdout });
    const timer = setTimeout(() => finish(new Error("Model list timed out")), 8_000);
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      lines.close();
      child.stdin.end();
      const done = () => error ? reject(error) : resolve(models);
      if (process.platform === "win32" && child.pid && child.exitCode === null) {
        // The Windows shell and app-server must both terminate after this read-only request.
        execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"],
          { windowsHide: true, timeout: 3_000 }, () => done());
      } else {
        if (child.exitCode === null) child.kill();
        done();
      }
    }
    const send = (value: object) => child.stdin.write(JSON.stringify(value) + "\n");
    child.once("error", () => finish(new Error("Codex CLI unavailable")));
    child.stdin.once("error", () => finish(new Error("Codex CLI connection failed")));
    child.once("close", () => finish(new Error("Codex CLI closed before returning models")));
    child.stdout.on("data", (chunk: Buffer) => {
      byteCount += chunk.length;
      if (byteCount > 512_000) finish(new Error("Model list is too large"));
    });
    child.stderr.resume();
    lines.on("line", (line) => {
      if (settled) return;
      try {
        const message = JSON.parse(line);
        if (message.id !== 1 && message.id !== 2) return;
        if (message.error) return finish(new Error("Codex model list request failed"));
        if (message.id === 1) {
          send({ method: "initialized", params: {} });
          send({ id: 2, method: "model/list", params: { limit: 100 } });
          return;
        }
        models.push(...parseCodexModels(message.result?.data));
        const cursor = message.result?.nextCursor;
        if (typeof cursor === "string" && cursor) {
          if (++pages >= 10 || cursors.has(cursor)) return finish(new Error("Invalid model pagination"));
          cursors.add(cursor);
          send({ id: 2, method: "model/list", params: { limit: 100, cursor } });
        } else {
          finish();
        }
      } catch {
        finish(new Error("Invalid Codex model list response"));
      }
    });
    send({ id: 1, method: "initialize", params: {
      clientInfo: { name: "loop-model-list", version: "0.2.0" },
    } });
  });
}

export function mergeAgentModels(
  tool: RunTool,
  models: AgentModel[],
  profiles: AgentProfile[]
): AgentModel[] {
  const byId = new Map(models.map((model) => [model.id, model]));
  const canonical = (name: RunTool) => name === "cursor" ? "agent" : name;
  for (const profile of profiles) {
    if (canonical(profile.tool) !== canonical(tool) || !profile.model) continue;
    if (!byId.has(profile.model)) byId.set(profile.model, { id: profile.model, name: profile.model });
  }
  return [...byId.values()];
}

const cache = new Map<string, { expires: number; value: Promise<AgentModelCatalog> }>();

export async function getAgentModels(
  projectRoot: string,
  tool: RunTool,
  profiles: AgentProfile[]
): Promise<AgentModelCatalog> {
  if (tool !== "codex") return { models: mergeAgentModels(tool, [], profiles) };
  let entry = cache.get(projectRoot);
  if (!entry || entry.expires <= Date.now()) {
    const value = readCodexModels(projectRoot).then(
      (models): AgentModelCatalog => ({ models }),
      (): AgentModelCatalog => ({ models: [], warning: "无法读取 Codex 模型列表" })
    );
    entry = { expires: Date.now() + 30_000, value };
    if (cache.size >= 50) cache.clear();
    cache.set(projectRoot, entry);
  }
  const catalog = await entry.value;
  return { ...catalog, models: mergeAgentModels(tool, catalog.models, profiles) };
}

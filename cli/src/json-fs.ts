import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const LOCK_RETRIES = 40;
const LOCK_DELAY_MS = 25;

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin */
  }
}

/** 基于目录的简易互斥锁，用于 JSON 状态并发写入 */
export function withStateLock<T>(stateDir: string, fn: () => T): T {
  const lockRoot = join(stateDir, ".locks");
  if (!existsSync(lockRoot)) mkdirSync(lockRoot, { recursive: true });
  const lockPath = join(lockRoot, "state.lock");

  for (let i = 0; i < LOCK_RETRIES; i++) {
    try {
      mkdirSync(lockPath);
      break;
    } catch {
      if (i === LOCK_RETRIES - 1) {
        throw new Error("无法获取 Loop 状态锁（并发写入超时）");
      }
      sleepSync(LOCK_DELAY_MS);
    }
  }

  try {
    return fn();
  } finally {
    try {
      rmSync(lockPath, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export function readJsonFile<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function listEntityFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json"));
}

export function readEntities<T>(dir: string): T[] {
  return listEntityFiles(dir)
    .map((file) => readJsonFile<T>(join(dir, file), null as T))
    .filter(Boolean);
}

export function writeEntity<T extends { id: string }>(dir: string, entity: T): void {
  writeJsonFile(join(dir, `${entity.id}.json`), entity);
}

export function deleteEntity(dir: string, id: string): void {
  const path = join(dir, `${id}.json`);
  if (existsSync(path)) unlinkSync(path);
}

export function replaceEntities<T extends { id: string }>(
  dir: string,
  entities: T[]
): void {
  if (existsSync(dir)) {
    for (const file of listEntityFiles(dir)) {
      unlinkSync(join(dir, file));
    }
  }
  for (const e of entities) writeEntity(dir, e);
}

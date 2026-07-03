import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

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

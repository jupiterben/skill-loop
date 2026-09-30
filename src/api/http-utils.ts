import type { IncomingMessage, ServerResponse } from "node:http";
import type { LoopStateDb } from "../db/db.js";
import { getProjectName } from "../db/get-project-name.js";
import { pickString } from "./api-helpers.js";

export async function readJsonBody(
  req: IncomingMessage
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

export function sendJson(
  res: ServerResponse,
  data: unknown,
  status = 200
): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

export function resolveProjectName(db: LoopStateDb): string {
  return getProjectName(db, process.env.LOOP_PROJECT_NAME?.trim());
}

export function requireBodyString(
  body: Record<string, unknown>,
  key: string
): string {
  const value = pickString(body, key, "").trim();
  if (!value) throw new Error(`${key} 必填`);
  return value;
}

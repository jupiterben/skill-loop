import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function hasLoopProject(root: string): boolean {
  return existsSync(join(root, "loop-data", "project.json"));
}

export function resolveProjectRoot(): string {
  const fromEnv = process.env.LOOP_PROJECT_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);

  const cwd = resolve(process.cwd());
  if (hasLoopProject(cwd)) return cwd;

  throw new Error(
    [
      "LOOP_PROJECT_ROOT 未设置，且当前目录不是已初始化的 Loop 项目。",
      "",
      "任选一种方式：",
      "  1. 在工作区根目录: $env:LOOP_PROJECT_ROOT = (Get-Location).Path",
      "  2. 先执行 loop init --project <名称> 初始化 loop-data/",
    ].join("\n")
  );
}

export function getPackageRoot(): string {
  return PACKAGE_ROOT;
}

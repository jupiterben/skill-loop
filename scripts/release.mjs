#!/usr/bin/env node
/**
 * 构建并输出精简发布目录 release/（仅运行所需文件，不含 src/ui 源码）。
 * 用法: node scripts/release.mjs [--zip]
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "release");
const cliDir = join(root, "cli");
const withZip = process.argv.includes("--zip");

function runBuild() {
  const cmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(cmd, ["build"], {
    cwd: cliDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function requireBuilt(path, label) {
  if (!existsSync(path)) {
    console.error(`缺少 ${label}，build 可能失败: ${path}`);
    process.exit(1);
  }
}

function copyReleaseTree() {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const rootFiles = ["SKILL.md", "README.md", "loop.sh", "loop.ps1"];
  for (const file of rootFiles) {
    cpSync(join(root, file), join(outDir, file));
  }

  mkdirSync(join(outDir, "cli"), { recursive: true });
  const cliPaths = ["dist", "public", "templates"];
  for (const name of cliPaths) {
    cpSync(join(cliDir, name), join(outDir, "cli", name), { recursive: true });
  }
}

function createZip() {
  if (process.platform === "win32") {
    const zipPath = join(root, "release.zip");
    if (existsSync(zipPath)) rmSync(zipPath);
    const ps = [
      "Compress-Archive",
      `-Path '${outDir.replace(/'/g, "''")}\\*'`,
      `-DestinationPath '${zipPath.replace(/'/g, "''")}'`,
      "-Force",
    ].join(" ");
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-Command", ps],
      { stdio: "inherit" }
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
    console.log(`已生成 ${zipPath}`);
    return;
  }

  const tarPath = join(root, "release.tar.gz");
  if (existsSync(tarPath)) rmSync(tarPath);
  const result = spawnSync("tar", ["-czf", tarPath, "-C", root, "release"], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`已生成 ${tarPath}`);
}

console.log("正在构建 CLI + 看板…");
runBuild();

requireBuilt(join(cliDir, "dist", "cli.js"), "CLI");
requireBuilt(join(cliDir, "public", "index.html"), "看板");

console.log("正在打包 release/ …");
copyReleaseTree();

const fileCount = ["SKILL.md", "README.md", "loop.sh", "loop.ps1", "cli/dist", "cli/public", "cli/templates"];
console.log(`\n发布目录: ${outDir}`);
console.log("包含:");
for (const item of fileCount) console.log(`  - ${item}`);
console.log("\n可整目录复制到 .cursor/skills/loop 或任意项目使用。");

if (withZip) createZip();

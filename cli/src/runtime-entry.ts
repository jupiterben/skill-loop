import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPackageRoot } from "./config.js";

export function resolveDistEntry(basename: string): string {
  const path = join(getPackageRoot(), "dist", `${basename}.js`);
  if (!existsSync(path)) {
    throw new Error(
      `未找到编译产物 dist/${basename}.js，请在 cli 目录执行 pnpm build`
    );
  }
  return path;
}

function quotePsSingle(value: string): string {
  return value.replace(/'/g, "''");
}

export async function spawnDetachedNodeProcess(
  entry: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  scriptPrefix: string
): Promise<void> {
  const node = process.execPath;
  const packageRoot = getPackageRoot();
  const argList = [entry, ...args].map(quotePsSingle);

  if (process.platform === "win32") {
    const scriptPath = join(
      tmpdir(),
      `${scriptPrefix}-${randomBytes(4).toString("hex")}.ps1`
    );
    const envLines = Object.entries(env)
      .filter(([, value]) => value != null)
      .map(
        ([key, value]) =>
          `$env:${key} = '${quotePsSingle(String(value ?? ""))}'`
      );
    const lines = [
      ...envLines,
      `Start-Process -FilePath '${quotePsSingle(node)}' ` +
        `-ArgumentList @(${argList.map((a) => `'${a}'`).join(",")}) ` +
        `-WorkingDirectory '${quotePsSingle(packageRoot)}' ` +
        `-WindowStyle Hidden | Out-Null`,
    ];
    writeFileSync(scriptPath, lines.join("\n"), "utf8");

    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-WindowStyle",
          "Hidden",
          "-File",
          scriptPath,
        ],
        { stdio: "ignore", windowsHide: true, env }
      );
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`后台进程启动失败 (exit ${code ?? "unknown"})`));
      });
    });

    try {
      unlinkSync(scriptPath);
    } catch {
      /* ignore */
    }
    return;
  }

  const child = spawn(node, [entry, ...args], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env,
    cwd: packageRoot,
  });
  child.unref();
}

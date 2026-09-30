import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getPackageRoot } from "../infra/config.js";

export function resolveDistEntry(basename: string): string {
  const path = join(getPackageRoot(), "dist", `${basename}.js`);
  if (!existsSync(path)) {
    throw new Error(
      `未找到编译产物 dist/${basename}.js，请在 skill 根目录执行 pnpm build`
    );
  }
  return path;
}

function quotePsSingle(value: string): string {
  return value.replace(/'/g, "''");
}

function quoteWindowsArgument(value: string): string {
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/g, "$&$&")}"`;
}

export async function spawnDetachedNodeProcess(
  entry: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  scriptPrefix: string
): Promise<void> {
  const node = process.execPath;
  const packageRoot = getPackageRoot();

  if (process.platform === "win32") {
    const commandLine = [entry, ...args].map(quoteWindowsArgument).join(" ");
    // Start-Process inherits the environment supplied to PowerShell by spawn.
    const lines = [
      "$ErrorActionPreference = 'Stop'",
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
      `Start-Process -FilePath '${quotePsSingle(node)}' ` +
        `-ArgumentList '${quotePsSingle(commandLine)}' ` +
        `-WorkingDirectory '${quotePsSingle(packageRoot)}' ` +
        `-WindowStyle Hidden | Out-Null`,
    ];
    const encodedCommand = Buffer.from(lines.join("\n"), "utf16le").toString("base64");

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
          "-EncodedCommand",
          encodedCommand,
        ],
        { stdio: ["ignore", "ignore", "pipe"], windowsHide: true, env }
      );
      let stderr = "";
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-8192);
      });
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve();
        else {
          const detail = stderr.trim();
          reject(new Error(
            `${scriptPrefix}: 后台进程启动失败 (exit ${code ?? "unknown"})` +
            (detail ? `\n${detail}` : "")
          ));
        }
      });
    });
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

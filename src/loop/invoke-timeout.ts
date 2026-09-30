import { execFile, type ChildProcess } from "node:child_process";

/** 结束子进程（含其子进程树），Windows 下用 taskkill 覆盖 shell 包装的子进程。 */
export function killChildTree(child: ChildProcess, done: () => void): void {
  if (process.platform === "win32" && child.pid && child.exitCode === null) {
    execFile(
      "taskkill.exe",
      ["/PID", String(child.pid), "/T", "/F"],
      { windowsHide: true, timeout: 3_000 },
      () => done()
    );
  } else {
    child.kill();
    done();
  }
}

/** 配置 profile.timeoutMs 生效：超时后结束进程树并触发 onTimeout。 */
export function armProcessTimeout(
  child: ChildProcess,
  timeoutMs: number | null | undefined,
  onTimeout: () => void
): void {
  if (!timeoutMs || timeoutMs <= 0) return;
  const timer = setTimeout(() => killChildTree(child, onTimeout), timeoutMs);
  timer.unref?.();
  child.once("close", () => clearTimeout(timer));
}

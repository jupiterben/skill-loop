import { spawn, type ChildProcess } from "node:child_process";

/**
 * opencode run 参数：--format json 输出 NDJSON 事件流，--model 选择 provider/model。
 * 提示词通过 stdin 传入（`opencode run - <prompt` 走 stdin，否则走 argv）。
 */
export const OPENCODE_STREAM_ARGS = [
  "--format",
  "json",
  "--model",
  "free/deepseek-v4-flash",
] as const;

const TEXT_KEYS = ["text", "content", "message", "delta", "output_text"] as const;

/**
 * 从 opencode 的 NDJSON 事件中抽取 display text。
 * 事件 shape: { type: "text", part: { text: "..." } } 或 { type: "text", text: "..." }
 */
export function parseOpencodeStreamLine(line: string): {
  display: string;
  resultText: string | null;
} {
  const trimmed = line.trim();
  if (!trimmed) return { display: "", resultText: null };
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { display: "", resultText: null };
  }
  const type = obj.type as string | undefined;
  if (type !== "text") return { display: "", resultText: null };

  const part = obj.part as Record<string, unknown> | undefined;
  const direct = (obj.text as string | undefined) ?? "";
  const fromPart =
    (part?.text as string | undefined) ??
    (part?.content as string | undefined) ??
    "";
  const text = direct || fromPart;
  if (text) {
    return { display: text, resultText: null };
  }
  return { display: "", resultText: null };
}

type StreamHandlers = {
  onDisplay: (text: string) => void;
  onStderr?: (text: string) => void;
};

function collectOpencodeStream(
  child: ChildProcess,
  handlers: StreamHandlers
): Promise<string> {
  return new Promise((resolve, reject) => {
    let lineBuf = "";
    let streamedText = "";

    const feedLine = (line: string) => {
      const { display } = parseOpencodeStreamLine(line);
      if (display) {
        streamedText += display;
        handlers.onDisplay(display);
      }
    };

    const feedStdout = (chunk: Buffer | string) => {
      lineBuf += String(chunk);
      const lines = lineBuf.split("\n");
      lineBuf = lines.pop() ?? "";
      for (const line of lines) feedLine(line);
    };

    child.stdout?.on("data", feedStdout);
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      handlers.onStderr?.(text);
      if (text.trim()) handlers.onDisplay(text);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (lineBuf.trim()) feedLine(lineBuf);
      if (code !== 0 && !streamedText.trim()) {
        reject(new Error(`opencode 退出码 ${code ?? "unknown"}`));
        return;
      }
      resolve(streamedText);
    });
  });
}

/** 调用 opencode run，将 prompt 通过 stdin 传入（opencode 的 - 模式） */
export function invokeOpencodeProcess(
  prompt: string,
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    handlers: StreamHandlers;
    model?: string;
  }
): Promise<string> {
  const model = options.model ?? "free/deepseek-v4-flash";
  // 末尾的 `-` 告诉 opencode 从 stdin 读 prompt
  const args = ["run", "--format", "json", "--model", model, "-"];
  const child = spawn("opencode", args, {
    cwd: options.cwd,
    env: options.env,
    shell: process.platform === "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin?.write(prompt);
  child.stdin?.end();
  return collectOpencodeStream(child, options.handlers);
}

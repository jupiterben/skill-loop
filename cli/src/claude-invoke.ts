import { spawn, type ChildProcess } from "node:child_process";

/** claude --print 默认 text 模式会缓冲到结束；stream-json 才能实时输出 */
export const CLAUDE_STREAM_ARGS = [
  "--dangerously-skip-permissions",
  "--print",
  "--output-format",
  "stream-json",
  "--verbose",
  "--include-partial-messages",
] as const;

export function parseClaudeStreamLine(line: string): {
  display: string;
  resultText: string | null;
} {
  const trimmed = line.trim();
  if (!trimmed) return { display: "", resultText: null };
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const type = obj.type as string | undefined;

    if (type === "stream_event") {
      const event = obj.event as Record<string, unknown> | undefined;
      const delta = event?.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        return { display: delta.text, resultText: null };
      }
    }

    if (type === "content_block_start") {
      const block = obj.content_block as Record<string, unknown> | undefined;
      if (block?.type === "tool_use" && typeof block.name === "string") {
        return { display: `\n▸ ${block.name}\n`, resultText: null };
      }
    }

    if (type === "result" && typeof obj.result === "string") {
      return { display: "", resultText: obj.result };
    }
  } catch {
    /* 非 JSON 行 */
  }
  return { display: "", resultText: null };
}

type StreamHandlers = {
  onDisplay: (text: string) => void;
  onStderr?: (text: string) => void;
};

function collectClaudeStream(
  child: ChildProcess,
  handlers: StreamHandlers
): Promise<string> {
  return new Promise((resolve, reject) => {
    let lineBuf = "";
    let streamedText = "";
    let finalResult = "";

    const feedLine = (line: string) => {
      const { display, resultText } = parseClaudeStreamLine(line);
      if (display) {
        streamedText += display;
        handlers.onDisplay(display);
      }
      if (resultText) finalResult = resultText;
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
      const output = finalResult || streamedText;
      if (code !== 0 && !output.trim()) {
        reject(new Error(`claude 退出码 ${code ?? "unknown"}`));
        return;
      }
      resolve(output);
    });
  });
}

export function invokeClaudeProcess(
  prompt: string,
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    handlers: StreamHandlers;
  }
): Promise<string> {
  const child = spawn("claude", [...CLAUDE_STREAM_ARGS], {
    cwd: options.cwd,
    env: options.env,
    shell: process.platform === "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin?.write(prompt);
  child.stdin?.end();
  return collectClaudeStream(child, options.handlers);
}

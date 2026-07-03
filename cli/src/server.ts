import { createServer as createHttpServer, type Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { LoopStateDb } from "./db.js";
import {
  clearDashboardState,
  readDashboardState,
  writeDashboardState,
  isPidAlive,
} from "./dashboard-process.js";
import { handleDashboardApiRequest, respondApiNotFound } from "./http-handlers.js";
import { getProjectRoot } from "./paths.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function serveStatic(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse
): boolean {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  let pathname = url.pathname;
  if (pathname === "/") pathname = "/index.html";

  const filePath = join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) return false;

  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  res.end(readFileSync(filePath));
  return true;
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.error(`无法自动打开浏览器: ${err.message}`);
  });
}

export type DashboardHandle = {
  server: Server;
  db: LoopStateDb;
  port: number;
  url: string;
  /** 本次调用是否成功绑定端口（false 表示已有实例在运行） */
  started: boolean;
};

export function startDashboardServer(options?: {
  port?: number;
  db?: LoopStateDb;
  openBrowser?: boolean;
  projectRoot?: string;
}): Promise<DashboardHandle> {
  const port = options?.port ?? Number(process.env.LOOP_DASHBOARD_PORT ?? 3460);
  const projectRoot = options?.projectRoot ?? getProjectRoot();
  const db = options?.db ?? new LoopStateDb(projectRoot);
  const shouldOpen =
    options?.openBrowser ?? process.env.LOOP_DASHBOARD_OPEN !== "0";

  const existing = readDashboardState(projectRoot);
  if (existing && isPidAlive(existing.pid) && existing.pid !== process.pid) {
    const url = existing.url;
    if (shouldOpen) openBrowser(url);
    return Promise.resolve({
      server: null as unknown as Server,
      db,
      port: existing.port,
      url,
      started: false,
    });
  }

  const httpServer = createHttpServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (req.method === "GET" && serveStatic(req, res)) return;

    void handleDashboardApiRequest(
      req,
      res,
      db,
      projectRoot,
      url.pathname
    ).then((handled) => {
      if (!handled) respondApiNotFound(res);
    });
  });

  const url = `http://localhost:${port}`;

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearDashboardState(projectRoot);
    httpServer.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return new Promise((resolve, reject) => {
    const onListening = () => {
      writeDashboardState(projectRoot, {
        pid: process.pid,
        port,
        url,
        startedAt: new Date().toISOString(),
      });
      if (process.env.LOOP_DASHBOARD_QUIET !== "1") {
        console.error(`Loop State Dashboard: ${url}`);
        console.error(`Project root: ${projectRoot}`);
      }
      if (shouldOpen) openBrowser(url);
      resolve({ server: httpServer, db, port, url, started: true });
    };

    httpServer.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        const running = readDashboardState(projectRoot);
        if (running && isPidAlive(running.pid)) {
          if (process.env.LOOP_DASHBOARD_QUIET !== "1") {
            console.error(`Dashboard 已在运行: ${running.url}`);
          }
          if (shouldOpen) openBrowser(running.url);
          process.exit(0);
          return;
        }
        console.error(`端口 ${port} 已被占用`);
        process.exit(1);
        return;
      }
      reject(err);
    });

    httpServer.listen(port, onListening);
  });
}

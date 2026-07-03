import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { LoopStateDb } from "../../src/db.js";

let devDb: LoopStateDb | null = null;
let shutdownBound = false;

function shutdownDevDb(): void {
  devDb?.close();
  devDb = null;
}

/** Vite dev 时在 :5173 内嵌 API，避免代理到陈旧的 :3460 实例 */
export function dashboardApiPlugin(): Plugin {
  return {
    name: "loop-cli-dashboard-api",
    apply: "serve",
    async configureServer(server) {
      const { LoopStateDb } = await import("../../src/db.js");
      const { getProjectRoot } = await import("../../src/paths.js");
      const { handleDashboardApiRequest, respondApiNotFound } = await import(
        "../../src/http-handlers.js"
      );

      if (!devDb) {
        const projectRoot = getProjectRoot();
        devDb = new LoopStateDb(projectRoot);
        const port = server.config.server.port ?? 5173;
        console.log(`[loop-cli] Dev API 内嵌 → http://localhost:${port}/api`);
        console.log(`[loop-cli] 项目根目录 → ${projectRoot}`);
      }

      server.middlewares.use(
        (
          req: IncomingMessage,
          res: ServerResponse,
          next: (err?: Error) => void
        ) => {
          const url = new URL(req.url ?? "/", "http://localhost");
          if (!url.pathname.startsWith("/api/")) {
            next();
            return;
          }

          void handleDashboardApiRequest(
            req,
            res,
            devDb!,
            getProjectRoot(),
            url.pathname
          ).then((handled) => {
            if (!handled) respondApiNotFound(res);
          });
        }
      );

      if (!shutdownBound) {
        shutdownBound = true;
        server.httpServer?.on("close", shutdownDevDb);
        const onExit = () => {
          shutdownDevDb();
          process.exit(0);
        };
        process.once("SIGINT", onExit);
        process.once("SIGTERM", onExit);
      }
    },
  };
}

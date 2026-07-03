import { startDashboardServer } from "./server.js";

const port = Number(process.env.LOOP_DASHBOARD_PORT ?? 3460);
startDashboardServer({ port, openBrowser: true }).then(({ url, started }) => {
  if (started && process.env.LOOP_DASHBOARD_QUIET !== "1") {
    console.log(`Dashboard: ${url}`);
    console.log(
      "提示：此为静态构建预览（无热更新）。前端开发请用 pnpm dev → http://localhost:5173"
    );
  }
});

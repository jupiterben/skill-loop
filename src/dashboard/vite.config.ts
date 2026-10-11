import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";
import { dashboardApiPlugin } from "./plugins/dashboard-api";

export default defineConfig({
  plugins: [svelte(), dashboardApiPlugin()],
  root: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, "../../public"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: true,
    watch: {
      // 后端 src/ 变更不触发 Vite 整站重启，避免打断 HMR
      ignored: [
        ...["api", "cli", "db", "domain", "infra", "loop"].map((dir) =>
          resolve(__dirname, `../${dir}/**`)
        ),
        resolve(__dirname, "../../dist/**"),
      ],
    },
  },
});

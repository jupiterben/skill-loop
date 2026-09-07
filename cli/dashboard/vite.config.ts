import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { dashboardApiPlugin } from "./plugins/dashboard-api";

export default defineConfig({
  plugins: [react(), dashboardApiPlugin()],
  root: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, "../public"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: true,
    watch: {
      // 后端 src/ 变更不触发 Vite 整站重启，避免打断 HMR
      ignored: [resolve(__dirname, "../src/**"), resolve(__dirname, "../dist/**")],
    },
  },
});

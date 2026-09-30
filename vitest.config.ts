import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname),
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/dashboard/**", "**/node_modules/**", "**/.git/**"],
    passWithNoTests: true,
  },
});

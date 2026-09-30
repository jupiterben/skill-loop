import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPackageRoot } from "./config.js";
import { resolveAgentPromptPath } from "../loop/loop-run.js";
import { resolvePlannerPromptPath } from "../loop/loop-plan.js";

describe("root package layout", () => {
  const temporaryRoots: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves the package beside src, templates, and the build configuration", () => {
    const root = getPackageRoot();
    expect(root).toBe(resolve(import.meta.dirname, "../.."));
    for (const path of [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tsconfig.json",
      "vitest.config.ts",
      "src/cli/cli.ts",
      "src/dashboard/vite.config.ts",
      "src/dashboard/vitest.config.ts",
    ]) {
      expect(existsSync(join(root, path)), path).toBe(true);
    }
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(manifest.main).toBe("./dist/cli/cli.js");
    expect(manifest.bin.loop).toBe(manifest.main);
  });

  it("loads both built-in prompts from the root templates directory", () => {
    vi.stubEnv("LOOP_AGENT_PROMPT", "");
    vi.stubEnv("LOOP_PLANNER_PROMPT", "");
    vi.stubEnv("LOOP_STATE_DIR", "");
    const projectRoot = mkdtempSync(join(tmpdir(), "loop-layout-"));
    temporaryRoots.push(projectRoot);
    vi.stubEnv("LOOP_STATE_DIR", join(projectRoot, "loop-data"));

    for (const [actual, name] of [
      [resolveAgentPromptPath(projectRoot), "AGENT.md"],
      [resolvePlannerPromptPath(projectRoot), "PLANNER.md"],
    ]) {
      expect(actual).toBe(join(getPackageRoot(), "templates", name));
      expect(readFileSync(actual, "utf8").trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps dashboard sources and tests out of the backend compilation", () => {
    const root = getPackageRoot();
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve("typescript/package.json");
    const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
    const output = execFileSync(process.execPath, [
      join(dirname(packagePath), manifest.bin.tsc),
      "--showConfig",
      "--project",
      join(root, "tsconfig.json"),
    ], { encoding: "utf8" });
    const config = JSON.parse(output) as { files: string[] };
    const files = config.files.map((file) => file.replaceAll("\\", "/"));
    expect(files).toContain("./src/cli/cli.ts");
    expect(files.some((file) => file.includes("/dashboard/"))).toBe(false);
    expect(files.some((file) => file.endsWith(".test.ts"))).toBe(false);
  });
});

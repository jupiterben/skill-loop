import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { spawnDetachedNodeProcess } from "./runtime-entry.js";

describe("detached Node process", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  async function launchFixture(prefix: string, args: string[]) {
    const root = mkdtempSync(join(tmpdir(), prefix));
    roots.push(root);
    const entry = join(root, "child.cjs");
    const output = join(root, "result.json");
    writeFileSync(
      entry,
      [
        'const { writeFileSync } = require("node:fs");',
        "writeFileSync(process.env.LOOP_TEST_OUTPUT, JSON.stringify({",
        "  args: process.argv.slice(2),",
        '  value: process.env["LOOP_TEST(NAME)"],',
        "  root: process.env.LOOP_PROJECT_ROOT,",
        "  cwd: process.cwd()",
        "}));",
      ].join("\n")
    );
    await spawnDetachedNodeProcess(
      entry,
      args,
      {
        ...process.env,
        LOOP_TEST_OUTPUT: output,
        "LOOP_TEST(NAME)": "value with 'quotes'\nand \u4e2d\u6587",
        LOOP_PROJECT_ROOT: root,
      },
      "loop-runtime-test"
    );
    await expect.poll(() => existsSync(output), { timeout: 10_000 }).toBe(true);
    return { root, result: JSON.parse(readFileSync(output, "utf8")) };
  }

  it("inherits environment variables with punctuation in their names", async () => {
    const { root, result } = await launchFixture("loop-runtime-", []);
    expect(result.value).toBe("value with 'quotes'\nand \u4e2d\u6587");
    expect(result.root).toBe(root);
    expect(result.args).toEqual([]);
  }, 20_000);

  it("preserves paths and arguments containing spaces, quotes, and Unicode", async () => {
    const args = ["two words", "", 'a"b', "C:\\trailing\\", "O'Brien", "\u4e2d\u6587"];
    const { result } = await launchFixture("loop runtime '\u4e2d\u6587-", args);
    expect(result.args).toEqual(args);
  }, 20_000);
});

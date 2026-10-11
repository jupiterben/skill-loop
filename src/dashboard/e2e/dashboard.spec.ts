import { test as base, expect, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { AddressInfo } from "node:net";
import { LoopStateDb } from "../../db/db";
import { startDashboardServer } from "../../api/server";
import type { DashboardData } from "../src/types";
import type { RequirementPlanJob } from "../../domain/requirement-plan";

const test = base.extend<{ app: { url: string; db: LoopStateDb } }>({
  app: async ({}, use) => {
    const root = mkdtempSync(join(tmpdir(), "loop-svelte-e2e-"));
    const previousEnv = { ...process.env };
    process.env.LOOP_STATE_DIR = join(root, "loop-data");
    process.env.LOOP_STATUS_DIR = join(root, ".loop-status");
    process.env.LOOP_DASHBOARD_QUIET = "1";
    const db = new LoopStateDb(root);
    db.upsertProject({ name: "Svelte migration", branchName: "main", description: "Browser verification" });
    const feature = db.addFeature("Svelte migration", { title: "Workspace", description: "", parentId: null });
    db.addFeature("Svelte migration", { title: "Delivery", description: "", parentId: null });
    for (const title of ["Draft requirement", "Ready requirement"]) {
      db.addStory("Svelte migration", {
        title, description: "Acceptance test story", workType: "implementation",
        acceptanceCriteria: ["Tests pass"], parentId: feature.id, milestoneId: null,
        dependsOn: [], priority: 0, notes: "", status: title.startsWith("Draft") ? "draft" : "ready",
      });
    }
    const signals = { SIGINT: process.listeners("SIGINT"), SIGTERM: process.listeners("SIGTERM") };
    const handle = await startDashboardServer({ port: 0, db, projectRoot: root, openBrowser: false });
    const url = `http://localhost:${(handle.server.address() as AddressInfo).port}`;
    try {
      await use({ url, db });
    } finally {
      handle.server.closeAllConnections();
      await new Promise<void>((done) => handle.server.close(() => done()));
      db.close();
      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        for (const listener of process.listeners(signal)) {
          if (!signals[signal].includes(listener)) process.removeListener(signal, listener);
        }
      }
      for (const key of ["LOOP_STATE_DIR", "LOOP_STATUS_DIR", "LOOP_DASHBOARD_QUIET"]) {
        if (previousEnv[key] === undefined) delete process.env[key]; else process.env[key] = previousEnv[key];
      }
      if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes("loop-svelte-e2e-")) throw new Error("Unsafe temporary test path");
      rmSync(root, { recursive: true, force: true });
    }
  },
});

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Loop Dashboard" })).toBeVisible();
  await expect(page.locator(".svelte-flow__node")).toHaveCount(5);
}

async function selectStory(page: Page, title = "Draft requirement") {
  await page.locator(".tree-item").filter({ hasText: title }).click();
  await expect(page.getByRole("complementary", { name: "节点属性" }).getByRole("heading", { name: title, exact: true })).toBeVisible();
  return page.getByRole("complementary", { name: "节点属性" });
}

test("renders the production Svelte graph, navigation, and responsive layouts", async ({ page, app }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, app.url);
  await expect(page.locator(".svelte-flow__edge")).toHaveCount(4);
  await page.screenshot({ path: testInfo.outputPath("desktop.png"), fullPage: true });
  for (const name of ["执行记录", "Agent 配置", "项目资料", "需求地图"]) {
    await page.getByRole("tab", { name }).click();
    await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
  }
  await expect(page.locator(".svelte-flow__node")).toHaveCount(5);
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator(".mindmap-canvas").scrollIntoViewIfNeeded();
    await expect(page.locator(".mindmap-canvas")).toBeVisible();
    await expect.poll(async () => {
      const canvas = await page.locator(".mindmap-canvas").boundingBox();
      const node = await page.locator('.svelte-flow__node[data-id="project:root"]').boundingBox();
      return Boolean(canvas && node && node.x >= canvas.x && node.y >= canvas.y &&
        node.x + node.width <= canvas.x + canvas.width && node.y + node.height <= canvas.y + canvas.height);
    }).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`viewport-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("restores a simple requirement message, tracks AI planning and locates the assigned Story", async ({ page, app }, testInfo) => {
  let job: RequirementPlanJob | null = null;
  let submissions = 0;
  await page.route("**/api/dashboard", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), installedAgentTools: ["codex"] } });
  });
  await page.route("**/api/requirements/plan", async (route) => {
    if (route.request().method() === "POST") {
      submissions++;
      const input = route.request().postDataJSON();
      job = { id: input.id, requirement: input.requirement, status: "running", startedAt: new Date().toISOString(),
        finishedAt: null, output: "正在匹配 Feature", error: null, stories: [], features: [] };
    }
    await route.fulfill({ json: { job } });
  });
  await open(page, app.url);
  await expect(page.getByRole("complementary", { name: "需求输入工作区" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "新需求", exact: true })).toHaveCount(0);
  const dialog = page.getByRole("region", { name: "AI 需求输入", exact: true });
  await dialog.getByLabel("需求内容").fill("Add an email password reset flow");
  await expect(dialog.getByRole("textbox")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("requirement-dialog.png") });
  await page.reload();
  await expect(dialog.getByLabel("需求内容")).toHaveValue("Add an email password reset flow");
  await dialog.getByRole("button", { name: "交给 AI 整理" }).click();
  await expect(dialog.getByRole("status")).toHaveText("正在整理需求...");
  await expect(dialog.getByLabel("需求内容")).toBeVisible();
  await page.getByRole("tab", { name: "项目资料" }).click();
  await expect(dialog.getByLabel("需求内容")).toBeVisible();
  const response = await page.request.post(`${app.url}/api/stories`, { data: {
    title: "Password reset", description: "Reset via email", workType: "implementation", parentId: "FT-001", acceptanceCriteria: ["Link expires after 30 minutes"],
  } });
  const { story } = await response.json();
  job = { ...job!, status: "completed", finishedAt: new Date().toISOString(), stories: [{ id: story.id, title: story.title, parentId: "FT-001", featureTitle: "Workspace" }] };
  await expect(dialog.getByRole("status")).toHaveText("需求已整理");
  await expect(dialog.getByLabel("需求内容")).toBeVisible();
  await expect(dialog.getByLabel("需求内容")).toHaveValue("");
  await dialog.locator("summary").first().click();
  await dialog.getByRole("button", { name: /Password reset/ }).click();
  const props = page.getByRole("complementary", { name: "节点属性" });
  await expect(props.getByRole("heading", { name: "Password reset", exact: true })).toBeVisible();
  await expect(props.getByText("Link expires after 30 minutes", { exact: true })).toBeVisible();
  await expect(props.getByRole("textbox")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("story-detail.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await props.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("story-detail-mobile.png"), fullPage: true });
  expect(app.db.getStories("Svelte migration").find((item) => item.id === story.id)?.parentId).toBe("FT-001");
  expect(submissions).toBe(1);
});

test("keeps edits through polling and failed saves, then confirms and completes a story", async ({ page, app }) => {
  await open(page, app.url);
  const props = await selectStory(page);
  await props.getByRole("button", { name: "编辑", exact: true }).click();
  await props.getByLabel("标题", { exact: true }).fill("Unsaved local title");
  await page.request.post(`${app.url}/api/stories/update`, { data: { storyId: "US-001", title: "External title" } });
  await page.getByRole("button", { name: "刷新项目数据" }).click();
  await expect(props.getByLabel("标题", { exact: true })).toHaveValue("Unsaved local title");
  await page.route("**/api/stories/update", (route) => route.fulfill({ status: 500, json: { error: "Simulated save failure" } }));
  await props.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Simulated save failure");
  await expect(props.getByLabel("标题", { exact: true })).toHaveValue("Unsaved local title");
  await page.unroute("**/api/stories/update");
  await props.getByRole("button", { name: "保存", exact: true }).click();
  await expect(props.getByText("有未保存的修改")).toHaveCount(0);
  expect(app.db.getStories("Svelte migration")[0].title).toBe("Unsaved local title");
  await props.getByRole("button", { name: "确认可执行", exact: true }).click();
  await props.getByRole("button", { name: "标记完成", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("完成说明").fill("Verified in browser");
  await dialog.getByRole("button", { name: "确认完成" }).click();
  await expect(dialog).toHaveCount(0);
  expect(app.db.getStories("Svelte migration")[0].passes).toBe(true);
  await expect(props.getByText("Story · 已完成", { exact: true })).toBeVisible();
});

test("creates milestones, assigns stories, filters and connects the graph", async ({ page, app }) => {
  await open(page, app.url);
  await page.getByRole("button", { name: "新建 Milestone", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("标签名称").fill("Release A");
  await dialog.getByLabel("版本").fill("v1");
  await dialog.getByRole("button", { name: "创建", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const props = await selectStory(page);
  await props.getByText("安排与分组", { exact: true }).click();
  await props.getByLabel("Milestone").selectOption({ label: "Release A" });
  await page.getByRole("button", { name: "Release A", exact: true }).click();
  await expect(page.locator('.svelte-flow__node[data-id="US-002"]')).toHaveCount(0);
  await page.getByRole("button", { name: "全部", exact: true }).click();
  await expect(page.locator('.svelte-flow__node[data-id="US-002"]')).toHaveCount(1);
  const source = page.locator('[data-nodeid="US-001"][data-handleid="dep-out"]');
  const target = page.locator('[data-nodeid="US-002"][data-handleid="dep-in"]');
  await source.click();
  await target.click();
  await expect.poll(() => app.db.getStories("Svelte migration").find((story) => story.id === "US-002")?.dependsOn).toEqual(["US-001"]);
  await expect(page.locator('.svelte-flow__edge[data-id="dep:US-001->US-002"]')).toHaveCount(1);
  await page.getByRole("tab", { name: "项目资料" }).click();
  await page.getByRole("tab", { name: "需求地图" }).click();
  await expect(page.locator('.svelte-flow__edge[data-id="dep:US-001->US-002"]')).toHaveCount(1);
});

test("persists project metadata, specifications and patterns", async ({ page, app }) => {
  await open(page, app.url);
  await page.getByRole("tab", { name: "项目资料" }).click();
  await page.getByLabel("Git 分支").fill("svelte-test");
  await page.getByRole("button", { name: "保存元信息" }).click();
  await expect.poll(() => app.db.getStatus("Svelte migration").branchName).toBe("svelte-test");
  await page.getByRole("button", { name: "编辑规范" }).click();
  await page.getByRole("dialog").getByLabel("内容").fill("Use Svelte 5 runes.");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(app.db.getProjectSpec("Svelte migration").content).toBe("Use Svelte 5 runes.");
  await page.getByRole("button", { name: "新增 Pattern" }).click();
  await page.getByRole("dialog").getByLabel("内容").fill("Preserve local edits during polling.");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(app.db.getPatterns("Svelte migration")).toContain("Preserve local edits during polling.");
});

test("shows errors and retries without losing the last dashboard", async ({ page, app }) => {
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 503, json: { error: "Offline test" } }));
  await page.goto(app.url);
  await expect(page.getByRole("alert")).toContainText("Offline test");
  await page.unroute("**/api/dashboard");
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.locator(".svelte-flow__node")).toHaveCount(5);
  await page.route("**/api/dashboard", (route) => route.fulfill({ status: 503, json: { error: "Refresh failure" } }));
  await page.getByRole("button", { name: "刷新项目数据" }).click();
  await expect(page.getByRole("alert")).toContainText("Refresh failure");
  await expect(page.locator(".svelte-flow__node")).toHaveCount(5);
});

test("configures an agent and validates run settings without launching a process", async ({ page, app }) => {
  await page.route("**/api/dashboard", async (route) => {
    const response = await route.fetch();
    const data = await response.json() as DashboardData;
    await route.fulfill({ json: { ...data, installedAgentTools: ["codex"] } });
  });
  await page.route("**/api/agent-models?*", (route) => route.fulfill({ json: { models: [{ id: "test-model", name: "Test model" }] } }));
  await open(page, app.url);
  await page.getByRole("tab", { name: "Agent 配置" }).click();
  await page.getByRole("button", { name: "新建配置" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("配置名称").fill("Browser test agent");
  await dialog.getByLabel("模型", { exact: true }).fill("test-model");
  await dialog.getByRole("button", { name: "保存配置" }).click();
  await expect(dialog).toHaveCount(0);
  expect(app.db.getAgentConfig("Svelte migration").profiles[0].name).toBe("Browser test agent");
  let launch: unknown;
  await page.route("**/api/loop-run/start", async (route) => {
    launch = route.request().postDataJSON();
    await route.fulfill({ status: 400, json: { error: "Launch intercepted for safety" } });
  });
  await page.getByRole("button", { name: "启动", exact: true }).click();
  await dialog.getByLabel("执行 Agent").selectOption("profile:AG-001");
  await dialog.getByLabel("Workers").fill("2");
  await dialog.getByText("有限轮", { exact: true }).click();
  await dialog.getByLabel("最大轮数").fill("3");
  await dialog.getByRole("button", { name: "启动外循环", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Launch intercepted for safety");
  expect(launch).toEqual({ agentProfileId: "AG-001", workers: 2, untilStop: false, maxIterations: 3 });
});

test("reparents a story by dragging and supports keyboard graph navigation", async ({ page, app }) => {
  await open(page, app.url);
  const source = page.locator('.svelte-flow__node[data-id="US-001"]');
  const target = page.locator('.svelte-flow__node[data-id="FT-002"]');
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect.poll(() => app.db.getStories("Svelte migration").find((story) => story.id === "US-001")?.parentId).toBe("FT-002");
  await page.locator(".tree-item").filter({ hasText: "Svelte migration" }).click();
  await page.locator(".mindmap-canvas").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("complementary", { name: "节点属性" }).getByRole("heading", { name: "Workspace", exact: true })).toBeVisible();
});

test("archives and restores completed stories and deletes an unused draft", async ({ page, app }) => {
  app.db.completeStoryWithProgress("Svelte migration", "US-002", { summary: "Already completed" });
  await open(page, app.url);
  page.on("dialog", (dialog) => dialog.accept());
  const props = await selectStory(page, "Ready requirement");
  await props.getByText("生命周期", { exact: true }).click();
  await props.getByRole("button", { name: "标记等待删除", exact: true }).click();
  await expect(props.getByText("Story · 等待删除", { exact: true })).toBeVisible();
  await props.getByRole("button", { name: "归档", exact: true }).click();
  await expect(props.getByText("Story · 已归档", { exact: true })).toBeVisible();
  expect(app.db.getArchivedStories("Svelte migration")).toHaveLength(1);
  await props.getByRole("button", { name: "恢复", exact: true }).click();
  await expect.poll(() => app.db.getArchivedStories("Svelte migration")).toHaveLength(0);
  await selectStory(page);
  await props.getByText("生命周期", { exact: true }).click();
  await props.getByRole("button", { name: "删除 Story", exact: true }).click();
  await expect.poll(() => app.db.getStories("Svelte migration").some((story) => story.id === "US-001")).toBe(false);
  await expect(props.getByRole("heading", { name: "Svelte migration", exact: true })).toBeVisible();
});

test("preserves a failed planning request in the persistent input without auto-retrying", async ({ page, app }) => {
  let job: RequirementPlanJob | null = null;
  let calls = 0;
  await page.route("**/api/dashboard", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), installedAgentTools: ["codex"] } });
  });
  await page.route("**/api/requirements/plan", async (route) => {
    if (route.request().method() === "POST") {
      calls++;
      const input = route.request().postDataJSON();
      job = { id: input.id, requirement: input.requirement, status: "failed", startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(), output: "", error: "Agent is not authenticated", stories: [], features: [] };
    }
    await route.fulfill({ json: { job } });
  });
  await open(page, app.url);
  const dialog = page.getByRole("region", { name: "AI 需求输入", exact: true });
  await dialog.getByLabel("需求内容").fill("Add password reset");
  await dialog.getByRole("button", { name: "交给 AI 整理" }).click();
  await expect(dialog.getByRole("status")).toHaveText("规划未完成");
  await dialog.locator("summary").first().click();
  await expect(dialog.getByRole("alert")).toContainText("not authenticated");
  await page.reload();
  await expect(dialog.getByRole("status")).toHaveText("规划未完成");
  await dialog.locator("summary").first().click();
  await expect(dialog.getByRole("alert")).toContainText("not authenticated");
  await expect(dialog.getByLabel("需求内容")).toHaveValue("Add password reset");
  expect(calls).toBe(1);
});

test("keeps the persistent requirement input usable on mobile without an installed agent", async ({ page, app }, testInfo) => {
  await page.route("**/api/dashboard", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), installedAgentTools: [] } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, app.url);
  const dialog = page.getByRole("region", { name: "AI 需求输入", exact: true });
  await dialog.getByLabel("需求内容").fill("Add search");
  await expect(dialog.getByRole("button", { name: "交给 AI 整理" })).toBeDisabled();
  await expect(dialog.getByText("未检测到本机 Agent CLI")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("requirement-mobile.png") });
  await dialog.getByRole("button", { name: "Agent 配置", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Agent 配置" })).toHaveAttribute("aria-selected", "true");
});

test("shows Story IDs and safe quick actions in the structure tree", async ({ page, app }, testInfo) => {
  app.db.completeStoryWithProgress("Svelte migration", "US-002", { summary: "Completed" });
  await open(page, app.url);
  const tree = page.getByRole("navigation", { name: "项目结构树" });
  await expect(tree.locator(".tree-item").filter({ hasText: "Draft requirement" }).locator("code")).toHaveText("US-001");
  await expect(tree.locator(".tree-item").filter({ hasText: "Ready requirement" }).locator("code")).toHaveText("US-002");
  await expect(tree.getByRole("button", { name: "非空 Feature，需先移除子节点 FT-001", exact: true })).toBeDisabled();
  await expect(tree.getByRole("button", { name: "删除 Feature FT-002", exact: true })).toBeEnabled();
  await expect(tree.getByRole("button", { name: "删除 Story US-002", exact: true })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await tree.getByRole("button", { name: "删除 Story US-001", exact: true }).click();
  expect(app.db.getStories("Svelte migration").some((story) => story.id === "US-001")).toBe(true);
  await expect(page.getByRole("complementary", { name: "节点属性" }).getByRole("heading", { name: "Svelte migration", exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await tree.getByRole("button", { name: "标记等待删除 US-002", exact: true }).click();
  await expect.poll(() => app.db.getStories("Svelte migration").find((story) => story.id === "US-002")?.removalRequestedAt).toBeTruthy();
  await expect(tree.locator(".tree-item").filter({ hasText: "Ready requirement" })).toContainText("待移除");
  await expect(tree.getByRole("button", { name: "归档 Story US-002", exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await tree.scrollIntoViewIfNeeded();
  await expect(tree.getByRole("button", { name: "删除 Story US-001", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("tree-mobile.png"), fullPage: true });
  page.once("dialog", (dialog) => dialog.accept());
  await tree.getByRole("button", { name: "删除 Story US-001", exact: true }).click();
  await expect(tree.locator(".tree-item").filter({ hasText: "US-001" })).toHaveCount(0);
  expect(app.db.getStories("Svelte migration").some((story) => story.id === "US-001")).toBe(false);
});

test("disables quick deletion for running Stories and retains the row on API failure", async ({ page, app }) => {
  await page.route("**/api/dashboard", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.userStories = data.userStories.map((story: { id: string }) => story.id === "US-002" ? { ...story, claimedBy: "worker-1" } : story);
    await route.fulfill({ json: data });
  });
  await open(page, app.url);
  const tree = page.getByRole("navigation", { name: "项目结构树" });
  await expect(tree.getByRole("button", { name: "Story 执行中，暂不可删除 US-002", exact: true })).toBeDisabled();
  await page.route("**/api/stories/delete", (route) => route.fulfill({ status: 500, json: { error: "Deletion failed" } }));
  page.once("dialog", (dialog) => dialog.accept());
  await tree.getByRole("button", { name: "删除 Story US-001", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Deletion failed");
  await expect(tree.locator(".tree-item").filter({ hasText: "US-001" })).toBeVisible();
});

test("consolidates manual creation into one tree menu with parent selection", async ({ page, app }, testInfo) => {
  await open(page, app.url);
  const add = page.getByRole("button", { name: "手动新增", exact: true });
  await expect(add).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^(Feature|Story)$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "新建 Feature", exact: true })).toHaveCount(0);
  await page.locator(".tree-item").filter({ hasText: "Workspace" }).click();
  await expect(page.getByRole("button", { name: /^(Feature|Story)$/ })).toHaveCount(0);
  await add.click();
  await expect(page.getByRole("button", { name: "新建 Story", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "新建 Story", exact: true })).toHaveCount(0);
  await add.click();
  await page.getByRole("button", { name: "新建 Story", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("所属 Feature")).toHaveValue("FT-001");
  await dialog.getByLabel("标题", { exact: true }).fill("Manual child");
  await dialog.getByRole("button", { name: "创建", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(app.db.getStories("Svelte migration").find((story) => story.title === "Manual child")?.parentId).toBe("FT-001");
  await add.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "新建 Feature", exact: true }).click();
  await dialog.getByLabel("标题", { exact: true }).fill("Manual root");
  await dialog.getByLabel("所属 Feature").selectOption("");
  await dialog.getByRole("button", { name: "创建", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(app.db.getFeatures("Svelte migration").find((feature) => feature.title === "Manual root")?.parentId).toBeNull();
  await page.setViewportSize({ width: 390, height: 844 });
  await add.click();
  await expect(page.getByRole("button", { name: "新建 Feature", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("create-menu-mobile.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("需求内容")).toBeVisible();
});

test("distinguishes Feature groups from Story tasks across tree, graph and details", async ({ page, app }, testInfo) => {
  await open(page, app.url);
  const feature = page.locator('.svelte-flow__node[data-id="FT-001"]');
  const story = page.locator('.svelte-flow__node[data-id="US-001"]');
  await expect(feature.locator(".node-type")).toHaveText("Feature");
  await expect(story.locator(".node-type")).toHaveText("Story");
  await expect(feature.locator("code")).toHaveText("FT-001");
  await expect(story.locator("code")).toHaveText("US-001");
  expect(await feature.locator(".mm-node").evaluate((el) => getComputedStyle(el).borderLeftWidth)).toBe("4px");
  expect(await story.locator(".mm-node").evaluate((el) => getComputedStyle(el).borderLeftWidth)).toBe("1px");
  const tree = page.getByRole("navigation", { name: "项目结构树" });
  await expect(tree.locator(".tree-row--feature").first().locator(".tree-type-label")).toHaveText("Feature");
  await expect(tree.locator(".tree-row--story").first().locator(".tree-type-label")).toHaveText("Story");
  await tree.locator(".tree-item").filter({ hasText: "Workspace" }).click();
  const props = page.getByRole("complementary", { name: "节点属性" });
  await expect(props.getByText("Feature · 功能分组", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("feature-detail.png") });
  await selectStory(page);
  await expect(props.getByText("Story · 任务", { exact: true })).toBeVisible();
  await expect(props.getByText("Story · 草稿", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("story-detail.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await tree.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("types-mobile.png"), fullPage: true });
});

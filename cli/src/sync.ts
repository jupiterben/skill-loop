import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { LoopStateDb } from "./db.js";
import { getPrdPath, getProgressPath } from "./paths.js";
import type { Feature, Milestone, Prd, ProgressEntry, UserStory } from "./types.js";

export function parseProgressTxt(content: string): {
  patterns: string[];
  entries: ProgressEntry[];
} {
  const patterns: string[] = [];
  const entries: ProgressEntry[] = [];

  const patternMatch = content.match(
    /## Codebase Patterns\r?\n([\s\S]*?)(?=\r?\n---|\r?\n## |\r?\n$)/
  );
  if (patternMatch) {
    for (const line of patternMatch[1].split(/\r?\n/)) {
      const trimmed = line.replace(/^-\s*/, "").trim();
      if (trimmed) patterns.push(trimmed);
    }
  }

  const blocks = content.split(/\r?\n(?=## )/);
  for (const block of blocks) {
    const header = block.match(/^## ([^\n]+)/);
    if (!header) continue;
    const title = header[1].trim();
    if (title === "Codebase Patterns") continue;

    const storyMatch = title.match(/^(.+?)\s*-\s*((?:US|FT)-\d+)/);
    const entryDate = storyMatch?.[1]?.trim() ?? title;
    const storyId = storyMatch?.[2] ?? null;

    const body = block.slice(header[0].length).trim();
    const learnings: string[] = [];
    const summaryLines: string[] = [];

    const learningsMatch = body.match(
      /\*\*Learnings for future iterations:\*\*\r?\n([\s\S]*?)(?=\r?\n---|\r?\n$)/
    );
    if (learningsMatch) {
      for (const line of learningsMatch[1].split(/\r?\n/)) {
        const trimmed = line.replace(/^\s*-\s*/, "").trim();
        if (trimmed) learnings.push(trimmed);
      }
    }

    const summaryBody = learningsMatch
      ? body.slice(0, body.indexOf("**Learnings for future iterations:**")).trim()
      : body.replace(/---\s*$/, "").trim();

    for (const line of summaryBody.split(/\r?\n/)) {
      const trimmed = line.replace(/^\s*-\s*/, "").trim();
      if (trimmed && !trimmed.startsWith("**")) summaryLines.push(trimmed);
    }

    if (summaryLines.length || learnings.length) {
      entries.push({
        storyId,
        entryDate,
        summary: summaryLines.join("\n"),
        learnings,
      });
    }
  }

  return { patterns, entries };
}

export function renderProgressTxt(
  patterns: string[],
  entries: ProgressEntry[],
  startedAt?: string
): string {
  const lines: string[] = [
    "# Loop Progress Log",
    `Started: ${startedAt ?? new Date().toISOString().slice(0, 10)}`,
    "---",
    "",
    "## Codebase Patterns",
  ];

  for (const p of patterns) {
    lines.push(`- ${p}`);
  }

  const ordered = [...entries].reverse();
  for (const e of ordered) {
    lines.push("", `## ${e.entryDate}${e.storyId ? ` - ${e.storyId}` : ""}`);
    for (const line of e.summary.split(/\r?\n/)) {
      if (line.trim()) lines.push(`- ${line.trim()}`);
    }
    if (e.learnings.length) {
      lines.push("- **Learnings for future iterations:**");
      for (const l of e.learnings) {
        lines.push(`  - ${l}`);
      }
    }
    lines.push("---");
  }

  return lines.join("\n") + "\n";
}

export function loadPrdFromFile(projectRoot: string): Prd | null {
  const path = getPrdPath(projectRoot);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  return normalizePrd(raw);
}

function normalizePrd(raw: Record<string, unknown>): Prd {
  const milestones = (raw.milestones as Milestone[] | undefined) ?? [];
  const features = (raw.features as Feature[] | undefined) ?? [];
  let userStories = (raw.userStories as UserStory[] | undefined) ?? [];

  userStories = userStories.map((s, i) => ({
    ...s,
    milestoneId: s.milestoneId ?? null,
    parentId: s.parentId ?? null,
    dependsOn: s.dependsOn ?? [],
    sortOrder: s.sortOrder ?? i,
    status: s.status ?? "ready",
    everCompleted: Boolean(s.everCompleted ?? s.passes),
    removalRequestedAt: s.removalRequestedAt ?? null,
    archivedAt: s.archivedAt ?? null,
  }));

  return {
    project: String(raw.project ?? ""),
    branchName: String(raw.branchName ?? ""),
    description: String(raw.description ?? ""),
    milestones: milestones.map((m, i) => ({
      ...m,
      sortOrder: m.sortOrder ?? i,
    })),
    features: features.map((f, i) => ({
      id: f.id,
      parentId: f.parentId ?? null,
      title: f.title,
      description: f.description ?? "",
      sortOrder: f.sortOrder ?? i,
    })),
    userStories,
  };
}

export function importFromFiles(db: LoopStateDb, projectRoot: string): {
  project: string;
  features: number;
  userStories: number;
  patterns: number;
  progressEntries: number;
} {
  const prd = loadPrdFromFile(projectRoot);
  if (!prd) {
    throw new Error(`找不到 prd.json: ${getPrdPath(projectRoot)}`);
  }

  db.upsertProject({
    name: prd.project,
    branchName: prd.branchName,
    description: prd.description,
  });

  db.replaceMilestones(prd.project, prd.milestones);
  db.replaceFeatures(prd.project, prd.features);
  db.replaceStories(prd.project, prd.userStories);

  let patterns: string[] = [];
  let entries: ProgressEntry[] = [];
  const progressPath = getProgressPath(projectRoot);
  if (existsSync(progressPath)) {
    const parsed = parseProgressTxt(readFileSync(progressPath, "utf8"));
    patterns = parsed.patterns;
    entries = parsed.entries;
  }

  db.replacePatterns(prd.project, patterns);
  db.replaceProgress(prd.project, entries);

  return {
    project: prd.project,
    features: prd.features.length,
    userStories: prd.userStories.length,
    patterns: patterns.length,
    progressEntries: entries.length,
  };
}

export function exportToFiles(db: LoopStateDb, projectRoot: string): {
  prdPath: string;
  progressPath: string;
} {
  const projects = db.listProjects();
  if (!projects.length) throw new Error("数据库中无项目，请先 init 或 import");

  const projectName = projects[0];
  const meta = db.getProjectMeta(projectName);

  const prd: Prd = {
    project: meta.name,
    branchName: meta.branchName,
    description: meta.description,
    milestones: db.getMilestones(projectName),
    features: db.getFeatures(projectName),
    userStories: db.getActiveStories(projectName),
  };

  const prdPath = getPrdPath(projectRoot);
  writeFileSync(prdPath, JSON.stringify(prd, null, 2) + "\n", "utf8");

  const patterns = db.getPatterns(projectName);
  const entries = db.getProgress(projectName, 500);
  const progressPath = getProgressPath(projectRoot);
  writeFileSync(
    progressPath,
    renderProgressTxt(patterns, entries),
    "utf8"
  );

  return { prdPath, progressPath };
}

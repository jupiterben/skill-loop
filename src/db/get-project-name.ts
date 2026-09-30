import type { LoopStateDb } from "./db.js";

export function getProjectName(db: LoopStateDb, override?: string): string {
  if (override) return override;
  const projects = db.listProjects();
  if (projects.length === 1) return projects[0];
  if (projects.length === 0) {
    throw new Error("项目未初始化，请先执行: loop init --project <名称>");
  }
  throw new Error(
    `数据库中有多个项目 (${projects.join(", ")})，请指定 --project`
  );
}

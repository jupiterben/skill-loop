import type { Milestone } from "../../types";

/** 筛选栏 Tag 副标题：优先版本，否则目标日期 */
export function milestoneFilterMeta(
  milestone: Pick<Milestone, "version" | "targetDate">
): string | null {
  const version = milestone.version?.trim();
  if (version) return version;
  const targetDate = milestone.targetDate?.trim();
  if (targetDate) return targetDate;
  return null;
}

/** Story 属性面板等场景的完整展示文案 */
export function milestoneFullLabel(milestone: Milestone): string {
  const extras: string[] = [];
  const version = milestone.version?.trim();
  const targetDate = milestone.targetDate?.trim();
  if (version) extras.push(version);
  if (targetDate) extras.push(targetDate);
  if (!extras.length) return milestone.title;
  return `${milestone.title} (${extras.join(" · ")})`;
}

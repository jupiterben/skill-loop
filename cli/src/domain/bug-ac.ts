/** Bug 作为 Story 验收标准反例的格式化与去重 */

export function normalizeBugDescription(description: string): string {
  const text = description.trim();
  if (!text) throw new Error("缺陷描述不能为空");
  return text;
}

export function formatBugAc(description: string, sourceCompleted: boolean): string {
  const text = normalizeBugDescription(description);
  if (
    text.startsWith("不应出现：") ||
    text.startsWith("不应再出现：") ||
    text.startsWith("❌")
  ) {
    return text;
  }
  const prefix = sourceCompleted ? "不应再出现：" : "不应出现：";
  return `${prefix}${text}`;
}

export function hasBugAc(acceptanceCriteria: string[], description: string): boolean {
  const plain = normalizeBugDescription(description);
  const pending = formatBugAc(plain, false);
  const fixed = formatBugAc(plain, true);
  return acceptanceCriteria.some(
    (ac) => ac === pending || ac === fixed || ac.includes(plain)
  );
}

export function defaultFixStoryTitle(description: string): string {
  const plain = normalizeBugDescription(description)
    .replace(/^不应(再)?出现：/, "")
    .replace(/^❌\s*/, "");
  const max = 48;
  if (plain.length <= max) return `修复：${plain}`;
  return `修复：${plain.slice(0, max - 1)}…`;
}

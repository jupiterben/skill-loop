/** 侧栏预览：过长时截断，避免条目挤在一起 */
export function patternPreview(content: string, max = 200): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function needsExpand(content: string, max = 200): boolean {
  return content.trim().length > max;
}

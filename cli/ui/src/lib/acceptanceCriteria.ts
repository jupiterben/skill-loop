export const DEFAULT_ACCEPTANCE_CRITERIA = ["实现功能", "npm test 通过"];

export function formatAcceptanceCriteria(items: string[]): string {
  return items.join("\n");
}

export function parseAcceptanceCriteria(text: string): string[] {
  const items = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return items.length ? items : [...DEFAULT_ACCEPTANCE_CRITERIA];
}

export function acceptanceCriteriaEqual(a: string[], b: string[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

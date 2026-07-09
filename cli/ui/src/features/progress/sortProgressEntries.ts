import type { ProgressEntry } from "../../types";

/** 进度记录按 entryDate 倒序（新日期在前）。 */
export function sortProgressEntries(entries: ProgressEntry[]): ProgressEntry[] {
  return [...entries].sort((a, b) => b.entryDate.localeCompare(a.entryDate));
}

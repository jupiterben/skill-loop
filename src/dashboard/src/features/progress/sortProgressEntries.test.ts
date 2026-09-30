import { describe, expect, it } from "vitest";
import { sortProgressEntries } from "./sortProgressEntries";
import type { ProgressEntry } from "../../types";

function entry(
  partial: Pick<ProgressEntry, "entryDate" | "storyId" | "summary"> & {
    id?: number;
    learnings?: string[];
  }
): ProgressEntry {
  return {
    id: partial.id ?? 0,
    entryDate: partial.entryDate,
    storyId: partial.storyId,
    summary: partial.summary,
    learnings: partial.learnings ?? [],
  };
}

describe("sortProgressEntries", () => {
  it("sorts by entryDate descending", () => {
    const entries = [
      entry({ id: 1, entryDate: "2026-07-06", storyId: "US-001", summary: "a" }),
      entry({ id: 2, entryDate: "2026-07-09", storyId: "US-002", summary: "b" }),
      entry({ id: 3, entryDate: "2026-07-07", storyId: "US-003", summary: "c" }),
    ];
    expect(sortProgressEntries(entries).map((e) => e.id)).toEqual([2, 3, 1]);
  });

  it("does not mutate the input array", () => {
    const entries = [
      entry({ id: 1, entryDate: "2026-07-06", storyId: "US-001", summary: "a" }),
    ];
    const copy = [...entries];
    sortProgressEntries(entries);
    expect(entries).toEqual(copy);
  });
});

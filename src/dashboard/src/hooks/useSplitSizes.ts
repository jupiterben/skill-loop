import { useCallback, useState } from "react";

function loadSizes(key: string, fallback: number[]): number[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length === fallback.length &&
      parsed.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return parsed as number[];
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

/** 持久化 Splitter 面板尺寸（localStorage） */
export function useSplitSizes(storageKey: string, defaults: number[]) {
  const [sizes, setSizes] = useState<number[]>(() =>
    loadSizes(storageKey, defaults)
  );

  const onResizeEnd = useCallback(
    (next: number[]) => {
      setSizes(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  return { sizes, onResizeEnd };
}

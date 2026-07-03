import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardData } from "../types";
import { normalizeDashboard } from "../lib/normalize";

const REFRESH_IDLE_MS = 5000;
const REFRESH_ACTIVE_MS = 1500;

function isLoopActive(data: DashboardData | null): boolean {
  if (!data) return false;
  if (data.status.activeRun?.status === "running") return true;
  if ((data.status.activeRuns?.length ?? 0) > 0) return true;
  if (data.loopRunner?.running) return true;
  const lives =
    data.runLiveWorkers && data.runLiveWorkers.length > 0
      ? data.runLiveWorkers
      : data.runLive
        ? [data.runLive]
        : [];
  return lives.some(
    (l) => l.phase === "invoking" || l.phase === "starting"
  );
}

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const activeRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const next = normalizeDashboard(json);
      setData(next);
      activeRef.current = isLoopActive(next);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    let pollId: ReturnType<typeof setInterval> | undefined;
    let currentMs = REFRESH_IDLE_MS;

    const applyInterval = (ms: number) => {
      if (ms === currentMs && pollId !== undefined) return;
      currentMs = ms;
      if (pollId !== undefined) window.clearInterval(pollId);
      pollId = window.setInterval(() => void load(), ms);
    };

    void load();
    applyInterval(REFRESH_IDLE_MS);

    const watch = window.setInterval(() => {
      const next = activeRef.current ? REFRESH_ACTIVE_MS : REFRESH_IDLE_MS;
      applyInterval(next);
    }, 500);

    return () => {
      if (pollId !== undefined) window.clearInterval(pollId);
      window.clearInterval(watch);
    };
  }, [load]);

  const refreshMs = isLoopActive(data) ? REFRESH_ACTIVE_MS : REFRESH_IDLE_MS;

  return { data, error, lastUpdated, refreshMs, refresh: load };
}

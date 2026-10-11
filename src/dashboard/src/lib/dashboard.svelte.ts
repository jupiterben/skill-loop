import type { DashboardData } from "../types";
import { normalizeDashboard } from "./normalize";

export function isLoopActive(data: DashboardData | null): boolean {
  if (!data) return false;
  return data.loopRunner?.running === true ||
    data.status.activeRun?.status === "running" ||
    (data.status.activeRuns?.length ?? 0) > 0 ||
    (data.runLiveWorkers?.length ? data.runLiveWorkers : data.runLive ? [data.runLive] : [])
      .some((live) => live.phase === "starting" || live.phase === "invoking");
}

export function createDashboard() {
  let data = $state<DashboardData | null>(null);
  let error = $state<string | null>(null);
  let lastUpdated = $state<Date | null>(null);
  let controller: AbortController | undefined;
  let pending: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function load(): Promise<void> {
    if (pending) return pending;
    controller = new AbortController();
    const signal = controller.signal;
    pending = (async () => {
      try {
        const response = await fetch("/api/dashboard", { signal });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`);
        if (signal.aborted) return;
        data = normalizeDashboard(json);
        error = null;
        lastUpdated = new Date();
      } catch (cause) {
        if (!signal.aborted) error = cause instanceof Error ? cause.message : String(cause);
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  }

  async function poll() {
    await load();
    if (!stopped) timer = setTimeout(poll, isLoopActive(data) ? 1500 : 5000);
  }

  return {
    get data() { return data; },
    get error() { return error; },
    get lastUpdated() { return lastUpdated; },
    async refresh() {
      // A mutation must not reuse a poll that took its snapshot before the write.
      if (pending) await pending;
      if (!stopped) await load();
    },
    start() {
      stopped = false;
      void poll();
      return () => {
        stopped = true;
        clearTimeout(timer);
        controller?.abort();
      };
    },
  };
}

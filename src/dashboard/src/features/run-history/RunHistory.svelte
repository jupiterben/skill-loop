<script lang="ts">
  import { tick, untrack } from "svelte";
  import { ChevronLeft, ChevronRight, Eye, FilterX } from "lucide-svelte";
  import type { DashboardData, LoopRun, SelectedMindMapNode } from "../../types";
  import RunDetails from "./RunDetails.svelte";
  import {
    changeHistoryFilters, emptyHistoryFilters, formatRunDuration, formatRunTime, historyPage,
    initialHistoryState, loadedRunRange, reconcileHistory, runDurationMs, runKey, RUN_STATUS_LABELS,
    type HistoryFilters,
  } from "./runHistory";

  let { data, onLocate }: { data: DashboardData; onLocate: (node: SelectedMindMapNode) => void } = $props();
  let historyState = $state(initialHistoryState());
  let detailElement = $state<HTMLDivElement>();
  let page = $derived(historyPage(data, historyState));
  let range = $derived(loadedRunRange(data.runs));
  let workers = $derived([...new Set([...data.runs.map((run) => run.workerId).filter((id): id is string => !!id), ...(historyState.worker ? [historyState.worker] : [])])].sort());
  let selected = $derived(data.runs.find((run) => runKey(run) === historyState.selectedKey));
  let titles = $derived(new Map([...data.userStories, ...data.archivedStories].map((story) => [story.id, story.title])));

  // Reconcile local navigation against each externally refreshed snapshot.
  $effect(() => {
    const snapshot = data;
    untrack(() => { historyState = reconcileHistory(historyState, snapshot); });
  });
  function filter(filters: Partial<HistoryFilters>) { historyState = changeHistoryFilters(historyState, filters); }
  async function selectRun(run: LoopRun) {
    historyState = { ...historyState, selectedKey: runKey(run) };
    await tick();
    detailElement?.focus({ preventScroll: true });
    detailElement?.scrollIntoView({ block: "start" });
  }
</script>

<section class="runs-section" aria-label="运行历史">
  <h2>运行历史</h2>
  <div class="history-filters">
    <label class="keyword">Story ID / 标题关键词<input type="search" value={historyState.keyword} oninput={(event) => filter({ keyword: event.currentTarget.value })} /></label>
    <label>Worker<select value={historyState.worker} onchange={(event) => filter({ worker: event.currentTarget.value })}>
      <option value="">全部 Worker</option>{#each workers as worker (worker)}<option value={worker}>{worker}</option>{/each}
    </select></label>
    <label>运行状态<select value={historyState.status} onchange={(event) => filter({ status: event.currentTarget.value })}>
      <option value="">全部状态</option>{#each Object.entries(RUN_STATUS_LABELS) as [value, label] (value)}<option {value}>{label}</option>{/each}
    </select></label>
    <button class="icon-button" title="清空筛选" aria-label="清空筛选" onclick={() => filter(emptyHistoryFilters())}><FilterX size={18} /></button>
  </div>
  <p class="history-count muted" role="status">匹配 {page.total} 条 / 已加载 {range.total} 条；仅查询已加载记录，非全量历史。</p>
  <p class="muted">已加载开始时间范围：{range.total ? `${formatRunTime(range.oldest)} 至 ${formatRunTime(range.newest)}` : "暂无记录"}{#if range.unknownTimes}（{range.unknownTimes} 条时间未知）{/if}</p>
  <div class="table-scroll">
    <table><thead><tr><th>运行</th><th>Story / Worker</th><th>Agent / 模型</th><th>状态</th><th>开始时间</th><th>耗时</th><th>详情</th></tr></thead><tbody>
      {#each page.items as run (runKey(run))}
        <tr class:selected={historyState.selectedKey === runKey(run)}>
          <td>#{run.id ?? "-"}<small class="block">第 {run.iteration} 轮</small></td>
          <td><span>{run.storyId ?? "-"}</span><small class="block story-title">{titles.get(run.storyId ?? "") ?? ""}</small><small class="block">{run.workerId || "未记录 Worker"}</small></td>
          <td>{run.agentProfileName ?? run.tool ?? "-"}<small class="block">{run.model ?? "-"}</small></td>
          <td><span class="badge" class:failed={run.status === "failed"}>{RUN_STATUS_LABELS[run.status] ?? run.status}</span></td>
          <td>{formatRunTime(run.startedAt)}</td><td>{formatRunDuration(runDurationMs(run, Date.now()))}</td>
          <td><button class="icon-button" title={`查看运行 ${run.id ?? "-"} 详情`} aria-label={`查看运行 ${run.id ?? "-"} 详情`}
            aria-pressed={historyState.selectedKey === runKey(run)} onclick={() => selectRun(run)}><Eye size={17} /></button></td>
        </tr>
      {:else}<tr><td colspan="7" class="muted history-empty">{range.total ? "无匹配记录" : "暂无记录"}</td></tr>{/each}
    </tbody></table>
  </div>
  <nav class="history-pagination" aria-label="运行历史分页">
    <small>第 {page.first}-{page.last} 条 · 每页 20 条</small>
    <div class="actions">
      <button class="icon-button" title="上一页" aria-label="上一页" disabled={page.page <= 1} onclick={() => historyState = { ...historyState, page: page.page - 1 }}><ChevronLeft size={18} /></button>
      <span>{page.page} / {page.pageCount}</span>
      <button class="icon-button" title="下一页" aria-label="下一页" disabled={page.page >= page.pageCount} onclick={() => historyState = { ...historyState, page: page.page + 1 }}><ChevronRight size={18} /></button>
    </div>
  </nav>
  {#if selected}
    <div bind:this={detailElement} tabindex="-1">
      {#key runKey(selected)}<RunDetails run={selected} {data} {onLocate} onClose={() => historyState = { ...historyState, selectedKey: null }} />{/key}
    </div>
  {/if}
</section>

<style>
  .history-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; }
  .history-filters label { flex: 1 1 140px; }
  .history-filters .keyword { flex: 2 1 220px; }
  .history-filters .icon-button { margin-bottom: 4px; }
  .history-count { margin-bottom: 4px; }
  table { width: 100%; table-layout: fixed; min-width: 680px; }
  th:first-child { width: 64px; }
  th:nth-child(2) { width: 24%; }
  th:nth-child(5) { width: 145px; }
  th:nth-child(6) { width: 85px; }
  th:last-child { width: 52px; }
  td { overflow-wrap: anywhere; }
  .history-empty { height: 120px; text-align: center; vertical-align: middle; }
  tr.selected { background: var(--accent-subtle); }
  .story-title { margin: 3px 0; }
  .failed { color: var(--failed); }
  .history-pagination { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .history-pagination span { font-size: 12px; min-width: 48px; text-align: center; }
</style>

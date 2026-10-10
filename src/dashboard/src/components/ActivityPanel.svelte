<script lang="ts">
  import type { DashboardData, RunLivePhase, SelectedMindMapNode } from "../types";
  import RunHistory from "../features/run-history/RunHistory.svelte";
  import ProgressLog from "./ProgressLog.svelte";
  let { data, onLocate }: { data: DashboardData; onLocate: (node: SelectedMindMapNode) => void } = $props();
  let workers = $derived(data.runLiveWorkers?.length ? data.runLiveWorkers : data.runLive ? [data.runLive] : []);
  let selectedWorker = $state("");
  let live = $derived(workers.find((worker) => (worker.workerId ?? "main") === selectedWorker) ?? workers[0]);
  let output = $state<HTMLPreElement>();
  let follow = $state(true);
  const phases: Record<RunLivePhase, string> = { starting: "准备中", invoking: "执行中", between: "轮间等待", done: "已结束" };
  $effect(() => { if (live?.output && follow && output) output.scrollTop = output.scrollHeight; });
</script>
<div class="activity-layout">
  <div class="activity-main">
    <section class="live-section">
      <header class="section-head"><h2>Agent 实时输出</h2><label class="inline-label"><input type="checkbox" bind:checked={follow} />跟随输出</label></header>
      {#if workers.length > 1}<div class="worker-tabs">{#each workers as worker (worker.workerId ?? "main")}
        <button aria-pressed={live === worker} onclick={() => selectedWorker = worker.workerId ?? "main"}>{worker.workerId} · {worker.storyId ?? "等待任务"}</button>
      {/each}</div>{/if}
      {#if live}
        <div class="live-meta"><span class="badge">{phases[live.phase]}</span><span>第 {live.iteration} 轮 · {live.agentProfileName ?? live.tool} · {live.storyId ?? ""}</span>{#if live.model}<small>{live.model}</small>{/if}</div>
        <pre bind:this={output} class="live-output">{live.output || "等待 Agent 输出..."}</pre>
      {:else}<p class="muted empty-state">{data.loopRunner?.running ? "等待 Agent 输出..." : "暂无运行中的 Agent"}</p>{/if}
    </section>
    <RunHistory {data} {onLocate} />
  </div>
  <section class="progress-section"><h2>进度日志</h2><ProgressLog entries={data.progress} /></section>
</div>

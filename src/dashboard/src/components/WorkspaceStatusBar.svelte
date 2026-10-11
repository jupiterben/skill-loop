<script lang="ts">
  import type { DashboardData } from "../types";
  import { resolveWorkspaceStatusView } from "../features/workspace-status/workspaceStatus";
  let { data }: { data: DashboardData } = $props();
  let view = $derived(resolveWorkspaceStatusView(data.status, data.userStories, data.loopRunner));
</script>
<footer class="workspace-status" role="status">
  {#if view.kind === "parallel"}
    <span class="status-dot running"></span>并行执行中
    <span>{view.items.map((item) => `${item.workerId ?? ""} ${item.storyId} ${item.title}`).join(" · ")}</span>
    {#if view.stopRequested}<small>已请求停止...</small>{/if}
  {:else if view.kind === "running"}
    <span class="status-dot running"></span>执行中 <code>{view.storyId}</code> {view.title}
    {#if view.iteration != null}<small>第 {view.iteration} 轮 · {view.tool}</small>{/if}
    {#if view.stopRequested}<small>已请求停止...</small>{/if}
  {:else if view.kind === "runner-only"}外循环运行中
  {:else if view.kind === "complete"}<span class="success">全部 Story 已完成</span>
  {:else if view.kind === "ready"}就绪 · 下一任务 <code>{view.nextId}</code> {view.nextTitle}
  {:else}就绪 · 暂无待执行 Story{/if}
</footer>

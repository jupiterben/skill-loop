<script lang="ts">
  import { GitBranch, Network } from "lucide-svelte";
  import type { ProjectStatus } from "../types";
  import { resolveAppToolbarView } from "../features/app-toolbar/appToolbarView";
  let { status }: { status: ProjectStatus } = $props();
  let view = $derived(resolveAppToolbarView(status));
</script>
<header class="app-toolbar">
  <Network size={26} class="brand-icon" />
  <div class="brand"><h1>Loop Dashboard</h1><span>{view.project}</span></div>
  <div class="toolbar-stats">
    <span><strong class="success">{view.completed}</strong> 完成</span>
    <span><strong>{view.pending}</strong> 待做</span>
    <span><strong class="warning">{view.blocked}</strong> 阻塞</span>
    <span><strong>{view.drafts}</strong> 草稿</span>
  </div>
  <span class="branch"><GitBranch size={15} />{view.branchName}</span>
  {#if view.showRunning}<span class="badge success">运行中</span>{:else if view.showComplete}<span class="badge success">全部完成</span>{/if}
  <div class="toolbar-progress"><span>{view.progressPct}%</span><progress value={view.progressPct} max="100" aria-label="项目完成进度"></progress><small>{view.completed}/{view.total}</small></div>
</header>

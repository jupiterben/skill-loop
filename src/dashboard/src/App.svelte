<script lang="ts">
  import { onMount } from "svelte";
  import { BookOpen, History, Network, RefreshCw, Bot } from "lucide-svelte";
  import { createDashboard } from "./lib/dashboard.svelte";
  import { isLoopProcessRunning } from "./lib/runningStories";
  import { emptyAgentConfig } from "../../domain/agent-config";
  import type { SelectedMindMapNode } from "./types";
  import RequirementInput from "./features/requirement-composer/RequirementInput.svelte";
  import LoopRunControl from "./features/loop-run-control/LoopRunControl.svelte";
  import AgentConfigPanel from "./features/agent-config/AgentConfigPanel.svelte";
  import ProjectPanel from "./components/ProjectPanel.svelte";
  import ActivityPanel from "./components/ActivityPanel.svelte";
  import MindMapPanel from "./components/MindMapPanel.svelte";
  import WorkspaceStatusBar from "./components/WorkspaceStatusBar.svelte";
  import ErrorAlert from "./components/ErrorAlert.svelte";
  import AppToolbar from "./components/AppToolbar.svelte";
  const dashboard = createDashboard();
  onMount(dashboard.start);
  let activeView = $state("map");
  let focusNode = $state<SelectedMindMapNode | null>(null);
  let refreshing = $state(false);
  let data = $derived(dashboard.data);
  let config = $derived(data?.agentConfig ?? emptyAgentConfig());
  const tabs = [
    { id: "map", label: "需求地图", icon: Network },
    { id: "activity", label: "执行记录", icon: History },
    { id: "agents", label: "Agent 配置", icon: Bot },
    { id: "project", label: "项目资料", icon: BookOpen },
  ];
  function locate(node: SelectedMindMapNode) { focusNode = { ...node }; activeView = "map"; }
  async function refresh() {
    refreshing = true;
    try { await dashboard.refresh(); } finally { refreshing = false; }
  }
</script>

<svelte:head><title>{data ? `${data.status.project} · Loop Dashboard` : "Loop Dashboard"}</title></svelte:head>
<svelte:boundary>
  <div class="app-shell">
    {#if data}
      <AppToolbar status={data.status} />
      <ErrorAlert error={dashboard.error ? `数据刷新失败：${dashboard.error}。当前显示上次成功加载的数据。` : null} />
      {#key data.projectRoot ?? data.projectName}
        <div class="dashboard-workspace">
          <main class="workspace-main" aria-label="项目工作区">
            <div class="workspace-controls">
              <span class="workspace-context"><span class:running={isLoopProcessRunning(data)} class="status-dot"></span>
                {isLoopProcessRunning(data) ? "Agent 执行中" : "工作区"}
                <small>{data.features.length} Feature · {data.userStories.length} Story</small>
              </span>
              <div class="actions">
                <button class="icon-button" title="刷新项目数据" aria-label="刷新项目数据" disabled={refreshing} onclick={refresh}><RefreshCw size={17} class={refreshing ? "spin" : ""} /></button>
                <LoopRunControl loopRunner={data.loopRunner} agentConfig={config} installedTools={data.installedAgentTools}
                  onRefresh={dashboard.refresh} onManageAgents={() => activeView = "agents"} />
              </div>
            </div>
            <div class="workspace-tabs" role="tablist" aria-label="工作区视图">
              {#each tabs as tab, index (tab.id)}
                <button role="tab" id={`tab-${tab.id}`} aria-controls={`view-${tab.id}`} aria-selected={activeView === tab.id}
                  tabindex={activeView === tab.id ? 0 : -1} onclick={() => activeView = tab.id}
                  onkeydown={(event) => {
                    const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                    if (offset) { event.preventDefault(); activeView = tabs[(index + offset + tabs.length) % tabs.length].id; document.getElementById(`tab-${activeView}`)?.focus(); }
                  }}><tab.icon size={17} />{tab.label}</button>
              {/each}
            </div>
            <div id="view-map" role="tabpanel" aria-labelledby="tab-map" class="workspace-view" hidden={activeView !== "map"}>
              <MindMapPanel {data} {focusNode} active={activeView === "map"} onRefresh={dashboard.refresh} />
            </div>
            <div id="view-activity" role="tabpanel" aria-labelledby="tab-activity" class="workspace-view" hidden={activeView !== "activity"}><ActivityPanel {data} onLocate={locate} /></div>
            <div id="view-agents" role="tabpanel" aria-labelledby="tab-agents" class="workspace-view" hidden={activeView !== "agents"}>
              <AgentConfigPanel config={config} installedTools={data.installedAgentTools} onRefresh={dashboard.refresh} />
            </div>
            <div id="view-project" role="tabpanel" aria-labelledby="tab-project" class="workspace-view" hidden={activeView !== "project"}>
              <ProjectPanel {data} onRefresh={dashboard.refresh} />
            </div>
            <RequirementInput projectKey={data.projectRoot ?? data.projectName} {config}
              installedTools={data.installedAgentTools} onRefresh={dashboard.refresh} onLocate={locate}
              onManageAgents={() => activeView = "agents"} />
            <WorkspaceStatusBar {data} />
          </main>
        </div>
      {/key}
    {:else}
      <main class="centered">
        <h1>Loop Dashboard</h1>
        {#if dashboard.error}<ErrorAlert error={dashboard.error} /><button onclick={refresh} disabled={refreshing}><RefreshCw size={16} />重试</button>
        {:else}<RefreshCw size={24} class="spin" /><p role="status">加载中...</p>{/if}
      </main>
    {/if}
  </div>
  {#snippet failed(error, reset)}
    <main class="centered"><ErrorAlert error={error instanceof Error ? error.message : String(error)} /><button onclick={reset}>重新加载界面</button></main>
  {/snippet}
</svelte:boundary>

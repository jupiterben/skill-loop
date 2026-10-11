<script lang="ts">
  import { Play, Settings, Square } from "lucide-svelte";
  import Modal from "../../components/Modal.svelte";
  import ErrorAlert from "../../components/ErrorAlert.svelte";
  import { api } from "../../lib/api";
  import { buildStartLoopRunPayload, resolveLoopRunControlView, type LoopRunTool } from "./loopRunControlView";
  import { agentSelectionOptions } from "../agent-config/agentSelection";
  import type { AgentConfig, DashboardData } from "../../types";
  import type { RunTool } from "../../../../domain/run-tool";
  let { loopRunner, agentConfig, installedTools = [], onRefresh, onManageAgents }: {
    loopRunner?: DashboardData["loopRunner"]; agentConfig: AgentConfig; installedTools?: RunTool[];
    onRefresh: () => Promise<void>; onManageAgents: () => void;
  } = $props();
  let view = $derived(resolveLoopRunControlView(loopRunner));
  let open = $state(false);
  let busy = $state(false);
  let selection = $state("");
  let workers = $state(1);
  let untilStop = $state(true);
  let maxIterations = $state(10);
  let error = $state<string | null>(null);
  async function start(event: SubmitEvent) {
    event.preventDefault();
    busy = true; error = null;
    try {
      await api.startLoopRun(buildStartLoopRunPayload({
        ...(selection.startsWith("profile:") ? { agentProfileId: selection.slice(8) } :
          selection.startsWith("tool:") ? { tool: selection.slice(5) as LoopRunTool } : {}),
        workers, untilStop, maxIterations,
      }));
      open = false;
      await onRefresh();
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; }
  }
  async function stop() {
    busy = true; error = null;
    try { await api.stopLoopRun(); await onRefresh(); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; }
  }
</script>

<div class="loop-control">
  <small>{view.running ? `${view.agentProfileName ?? view.tool} · ${view.workers} workers` : "未运行"}</small>
  <button class="icon-button" title="Agent 配置" aria-label="Agent 配置" onclick={onManageAgents}><Settings size={17} /></button>
  {#if view.running}<button class="danger" disabled={busy || view.stopRequested} onclick={stop}><Square size={15} />{view.stopRequested ? "停止中..." : "停止"}</button>
  {:else}<button disabled={busy} onclick={() => { error = null; open = true; }}><Play size={15} />启动</button>{/if}
  {#if error && !open}<ErrorAlert {error} onclose={() => error = null} />{/if}
</div>
{#if open}
  <Modal title="启动外循环" {busy} onclose={() => open = false}>
    <form onsubmit={start}><fieldset disabled={busy} class="form-fields">
      <ErrorAlert {error} />
      <label>执行 Agent <select bind:value={selection}>{#each agentSelectionOptions(agentConfig, installedTools) as option (option.value)}<option value={option.value} disabled={"disabled" in option && option.disabled}>{option.label}</option>{/each}</select></label>
      <label>Workers <input type="number" min="1" max="8" required bind:value={workers} /></label>
      <div class="segmented">
        <label><input type="radio" name="run-mode" checked={untilStop} onchange={() => untilStop = true} /><span>持续运行</span></label>
        <label><input type="radio" name="run-mode" checked={!untilStop} onchange={() => untilStop = false} /><span>有限轮</span></label>
      </div>
      {#if !untilStop}<label>最大轮数 <input type="number" min="1" max="999" required bind:value={maxIterations} /></label>{/if}
      <button class="primary" type="submit"><Play size={16} />{busy ? "启动中..." : "启动外循环"}</button>
    </fieldset></form>
  </Modal>
{/if}

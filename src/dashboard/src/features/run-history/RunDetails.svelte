<script lang="ts">
  import { Archive, LocateFixed, X } from "lucide-svelte";
  import type { DashboardData, LoopRun, SelectedMindMapNode } from "../../types";
  import Modal from "../../components/Modal.svelte";
  import ProgressLog from "../../components/ProgressLog.svelte";
  import { formatRunDuration, formatRunTime, relatedRunProgress, resolveRunStory, runDurationMs, RUN_STATUS_LABELS } from "./runHistory";

  let { run, data, onLocate, onClose }: {
    run: LoopRun; data: DashboardData; onLocate: (node: SelectedMindMapNode) => void; onClose: () => void;
  } = $props();
  let target = $derived(resolveRunStory(run, data));
  let entries = $derived(relatedRunProgress(run, data.progress));
  let archiveOpen = $state(false);
</script>

<section class="run-detail" aria-label="运行详情">
  <header class="section-head"><h3>运行 #{run.id ?? "-"} · {RUN_STATUS_LABELS[run.status] ?? run.status}</h3>
    <button class="icon-button" title="关闭运行详情" aria-label="关闭运行详情" onclick={onClose}><X size={17} /></button>
  </header>
  <dl>
    <dt>Story</dt><dd>{run.storyId ?? "-"}{#if target.kind !== "missing"} · {target.story.title}{/if}</dd>
    <dt>Worker</dt><dd>{run.workerId || "未记录"}</dd>
    <dt>Agent</dt><dd>{run.agentProfileName ?? run.tool ?? "-"}{#if run.agentProfileId} ({run.agentProfileId}){/if}</dd>
    <dt>CLI / 模型</dt><dd>{run.tool ?? "-"} / {run.model ?? "未记录"}</dd>
    <dt>开始时间</dt><dd>{formatRunTime(run.startedAt)}</dd>
    <dt>结束时间</dt><dd>{run.status === "running" ? "执行中" : formatRunTime(run.endedAt)}</dd>
    <dt>耗时</dt><dd>{formatRunDuration(runDurationMs(run, Date.now()))}</dd>
  </dl>
  {#if target.kind === "active"}
    <button onclick={() => { if (target.kind === "active") onLocate(target.node); }}><LocateFixed size={16} />定位到需求地图</button>
  {:else if target.kind === "archived"}
    <button onclick={() => archiveOpen = true}><Archive size={16} />查看归档详情</button>
  {:else}<p class="muted">{target.reason}</p>{/if}
  <h3 class="detail-heading">完整消息</h3>
  <pre class="run-message">{run.message || "暂无消息"}</pre>
  <h3 class="detail-heading">关联进度 · {entries.length} 条</h3>
  <p class="muted">同一 Story 的已加载进度；不代表本次运行专属日志。当前项目已加载 {data.progress.length} 条进度。</p>
  <ProgressLog {entries} />
</section>

{#if archiveOpen && target.kind === "archived"}
  <Modal title={`${target.story.id} · 只读归档详情`} onclose={() => archiveOpen = false}>
    <div class="archive-detail">
      <h3>{target.story.title}</h3>
      <p class="muted">归档时间：{formatRunTime(target.story.archivedAt)}</p>
      <p class="pre-wrap">{target.story.description || "暂无描述"}</p>
      <h3>验收标准</h3>
      <ol>{#each target.story.acceptanceCriteria as criterion, index (index)}<li>{criterion}</li>{:else}<li>暂无验收标准</li>{/each}</ol>
      <h3>备注</h3><p class="pre-wrap">{target.story.notes || "暂无备注"}</p>
      <h3>关联进度</h3><ProgressLog {entries} />
    </div>
  </Modal>
{/if}

<style>
  .run-detail { margin-top: 18px; border-top: 1px solid var(--border); padding-top: 18px; min-width: 0; }
  .section-head h3 { margin: 0; }
  dl { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 8px 14px; font-size: 12px; }
  dt { color: var(--muted); }
  dd { margin: 0; overflow-wrap: anywhere; text-align: left; }
  .detail-heading { margin: 20px 0 8px; }
  .run-message { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 320px; overflow: auto; padding: 12px; background: var(--bg); font-size: 12px; }
  .archive-detail { overflow-wrap: anywhere; }
  .archive-detail li { white-space: pre-wrap; }
</style>

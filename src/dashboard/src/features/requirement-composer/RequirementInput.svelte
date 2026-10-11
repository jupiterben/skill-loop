<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { ArrowRight, CheckCircle, FileText, LoaderCircle, Send, Settings2, Sparkles } from "lucide-svelte";
  import type { AgentConfig, SelectedMindMapNode } from "../../types";
  import type { RunTool } from "../../../../domain/run-tool";
  import type { RequirementPlanJob } from "../../../../domain/requirement-plan";
  import { agentSelectionOptions } from "../agent-config/agentSelection";
  import { api } from "../../lib/api";
  import ErrorAlert from "../../components/ErrorAlert.svelte";
  import { parseRequirementDraft, requirementDraftKey } from "./requirementDraft";
  let { projectKey, config, installedTools = [], onRefresh, onLocate, onManageAgents }: {
    projectKey: string; config: AgentConfig; installedTools?: RunTool[];
    onRefresh: () => Promise<void>; onLocate: (node: SelectedMindMapNode) => void; onManageAgents: () => void;
  } = $props();
  const storageKey = untrack(() => `loop:requirement-message:v1:${encodeURIComponent(projectKey)}`);
  function restore() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        const legacy = parseRequirementDraft(localStorage.getItem(requirementDraftKey(projectKey)));
        return { text: [legacy.title, legacy.description, legacy.acceptanceCriteria].filter(Boolean).join("\n\n"), id: crypto.randomUUID() };
      }
      const saved = JSON.parse(raw);
      return { text: typeof saved.text === "string" ? saved.text : "", id: typeof saved.id === "string" ? saved.id : crypto.randomUUID() };
    } catch { return { text: "", id: crypto.randomUUID() }; }
  }
  const initial = restore();
  let text = $state(initial.text);
  let requestId = $state(initial.id);
  let submitting = $state(false);
  let job = $state<RequirementPlanJob | null>(null);
  let error = $state<string | null>(null);
  let storageError = $state<string | null>(null);
  let selection = $state("");
  let advanced = $state(false);
  let running = $derived(job?.status === "running");
  let handledId: string | null = null;
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify({ text, id: requestId })); storageError = null; }
    catch { storageError = "无法保存本机草稿"; }
  }
  function edit(value: string) {
    text = value;
    requestId = crypto.randomUUID();
    persist();
  }
  async function accept(next: RequirementPlanJob | null) {
    if (!next && job?.status === "running") return;
    if (job && next && (next.startedAt < job.startedAt ||
      (next.id === job.id && job.status !== "running" && next.status === "running"))) return;
    job = next;
    if (next && next.status !== "running" && handledId !== next.id) {
      handledId = next.id;
      await onRefresh();
      if (next.id === requestId && next.status === "completed") { text = ""; persist(); }
    }
  }
  onMount(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    async function poll() {
      controller = new AbortController();
      try {
        const next = await api.getRequirementPlan(controller.signal);
        if (!stopped) await accept(next);
      } catch (cause) {
        if (!stopped && running) error = `暂时无法读取规划状态：${cause instanceof Error ? cause.message : String(cause)}`;
      } finally { if (!stopped) timer = setTimeout(poll, running ? 1500 : 5000); }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
  });
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (submitting || running || !text.trim()) return;
    if (job && job.id === requestId && job.status === "failed") {
      requestId = crypto.randomUUID();
      persist();
    }
    submitting = true; error = null;
    try {
      const next = await api.planRequirement({
        id: requestId, requirement: text.trim(),
        ...(selection.startsWith("profile:") ? { agentProfileId: selection.slice(8) } :
          selection.startsWith("tool:") ? { tool: selection.slice(5) } : {}),
      });
      await accept(next);
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { submitting = false; }
  }
</script>

<section class="requirement-input" aria-label="AI 需求输入">
    <div class="requirement-input__inner">
      <ErrorAlert {error} />
      {#if job}
        <details class="requirement-result">
          <summary>
            {#if running}<LoaderCircle size={16} class="spin" />{:else if job.status === "completed"}<CheckCircle size={16} class="success" />{:else}<Sparkles size={16} />{/if}
            <span role="status">{running ? "正在整理需求..." : job.status === "completed" ? "需求已整理" : "规划未完成"}</span>
            {#if job.stories.length}<span class="badge">{job.stories.length} Story</span>{/if}
          </summary>
          <div class="requirement-result__body">
        <div class="requirement-message"><span class="message-author">你的需求</span><p>{job.requirement}</p></div>
        <section class="planner-result" aria-label="AI 规划结果">
          {#if job.error}<ErrorAlert error={job.error} />{/if}
          {#if !running && job.stories.length}
            <div class="planned-stories">
              {#each job.stories as story (story.id)}
                <button class="planned-story" onclick={() => onLocate({ id: story.id, kind: "draft" })}>
                  <FileText size={17} /><span><small>{story.featureTitle} / {story.id}</small><strong>{story.title}</strong></span><ArrowRight size={16} />
                </button>
              {/each}
            </div>
            <p class="planner-summary">{job.status === "failed" ? "已写入的 Story 已保留，请先检查后再提交。" : "已归入 Feature，等待确认执行。"}</p>
          {:else if job.status === "completed"}<p class="muted">本次没有新增 Story。</p>{/if}
          <details class="planner-log"><summary>{running ? "Agent 输出" : "规划记录"}</summary><pre>{job.output || "等待 Agent 响应..."}</pre></details>
        </section>
          </div>
        </details>
      {/if}
        <form onsubmit={submit}>
          <fieldset disabled={submitting || running} class="form-fields">
            <label class="requirement-message-label">AI 需求输入
              <textarea aria-label="需求内容" rows="2" maxlength="12000" required
                placeholder="描述你想实现的需求..."
                value={text} oninput={(event) => edit(event.currentTarget.value)}></textarea>
            </label>
            <ErrorAlert error={storageError} />
            {#if !installedTools.length}
              <p class="warning">未检测到本机 Agent CLI</p>
              <button type="button" onclick={onManageAgents}>Agent 配置</button>
            {/if}
            {#if advanced}
              <label>规划 Agent <select bind:value={selection}>
                {#each agentSelectionOptions(config, installedTools) as option (option.value)}
                  <option value={option.value} disabled={"disabled" in option && option.disabled}>{option.value ? option.label : "项目默认 Agent"}</option>
                {/each}
              </select></label>
            {/if}
            <footer class="requirement-submit">
              <button type="button" class="icon-button" aria-label="选择规划 Agent" title="选择规划 Agent" aria-expanded={advanced} onclick={() => advanced = !advanced}><Settings2 size={17} /></button>
              <small>自动归类 · 草稿待确认</small>
              <button type="submit" class="primary" disabled={!text.trim() || !installedTools.length}>
                {#if submitting}<LoaderCircle size={16} class="spin" />{:else}<Send size={16} />{/if}
                {running ? "规划中..." : submitting ? "提交中..." : "交给 AI 整理"}
              </button>
            </footer>
          </fieldset>
        </form>
    </div>
</section>

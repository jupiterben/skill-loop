<script lang="ts">
  import { Pencil, Plus, Save, Trash2 } from "lucide-svelte";
  import type { DashboardData } from "../types";
  import { api } from "../lib/api";
  import { patternPreview, needsExpand } from "../features/patterns/patternPreview";
  import Modal from "./Modal.svelte";
  import ErrorAlert from "./ErrorAlert.svelte";
  let { data, onRefresh }: { data: DashboardData; onRefresh: () => Promise<void> } = $props();
  type MetaDraft = { branchName: string; description: string; vision: string };
  let draft = $state<MetaDraft | null>(null);
  let meta = $derived(draft ?? {
    branchName: data.status.branchName === "—" ? "" : data.status.branchName,
    description: data.status.description ?? "", vision: data.status.vision ?? "",
  });
  let busy = $state(false);
  let error = $state<string | null>(null);
  let modal = $state<"spec" | "pattern" | null>(null);
  let content = $state("");
  let editIndex = $state<number | null>(null);
  let templateId = $state("");
  let expanded = $state<Record<number, boolean>>({});
  function change(patch: Partial<MetaDraft>) { draft = { ...meta, ...patch }; }
  async function run(operation: () => Promise<unknown>, success?: () => void) {
    if (busy) return;
    busy = true; error = null;
    try { await operation(); await onRefresh(); success?.(); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; }
  }
  function applyTemplate(append: boolean) {
    if (!templateId || (data.projectSpec.content && !confirm(append ? "追加所选规范模板？" : "用所选模板替换当前规范？"))) return;
    void run(() => api.applyProjectSpecTemplate(templateId, append), () => templateId = "");
  }
  function editPattern(index: number | null) {
    editIndex = index;
    content = index === null ? "" : data.patterns[index];
    error = null; modal = "pattern";
  }
  function saveContent(event: SubmitEvent) {
    event.preventDefault();
    void run(() => modal === "spec" ? api.updateProjectSpec(content) :
      editIndex === null ? api.addPattern(content.trim()) : api.updatePattern(editIndex, content.trim()),
      () => modal = null);
  }
</script>
<div class="project-layout">
  <div class="project-settings">
    {#if !modal}<ErrorAlert {error} />{/if}
    <section class="page-section">
      <h2>项目元信息</h2>
      <form onsubmit={(event) => { event.preventDefault(); void run(() => api.updateProject(meta), () => draft = null); }}>
        <fieldset disabled={busy} class="form-fields">
          <label>项目名称 <input disabled value={data.status.project} /></label>
          <label>Git 分支 <input required value={meta.branchName} oninput={(e) => change({ branchName: e.currentTarget.value })} /></label>
          <label>项目描述 <textarea rows="3" value={meta.description} oninput={(e) => change({ description: e.currentTarget.value })}></textarea></label>
          <label>愿景 / 目标摘要 <textarea rows="3" value={meta.vision} oninput={(e) => change({ vision: e.currentTarget.value })}></textarea></label>
          <div class="form-actions">
            {#if draft}<button type="button" onclick={() => draft = null}>放弃修改</button>{/if}
            <button type="submit" class="primary" disabled={!draft || !meta.branchName.trim()}><Save size={16} />保存元信息</button>
          </div>
        </fieldset>
      </form>
    </section>
    <section class="page-section">
      <header class="section-head"><h2>项目规范</h2><button disabled={busy} onclick={() => { content = data.projectSpec.content; error = null; modal = "spec"; }}><Pencil size={16} />编辑规范</button></header>
      <p class="pre-wrap">{data.projectSpec.content.trim().slice(0, 240) || "尚未编写项目规范"}{data.projectSpec.content.length > 240 ? "..." : ""}</p>
      {#if data.projectSpec.templateId}<small>当前模板：{data.projectSpec.templateId}</small>{/if}
      <div class="form-fields">
        <label>规范模板 <select bind:value={templateId} disabled={busy}><option value="">选择模板</option>{#each data.projectSpecTemplates as template (template.id)}<option value={template.id}>{template.title}</option>{/each}</select></label>
        <div class="actions"><button disabled={busy || !templateId} onclick={() => applyTemplate(false)}>应用模板</button><button disabled={busy || !templateId} onclick={() => applyTemplate(true)}>追加模板</button></div>
      </div>
    </section>
  </div>
  <section class="page-section patterns-section">
    <header class="section-head"><h2>Codebase Patterns</h2><button disabled={busy} onclick={() => editPattern(null)}><Plus size={16} />新增 Pattern</button></header>
    {#each data.patterns as pattern, index (index)}
      <article class="pattern-item">
        <small>#{index + 1}</small><p class="pre-wrap">{expanded[index] ? pattern : patternPreview(pattern)}</p>
        <div class="actions">
          {#if needsExpand(pattern)}<button class="text-button" onclick={() => expanded[index] = !expanded[index]}>{expanded[index] ? "收起" : "展开全文"}</button>{/if}
          <button class="icon-button" title="编辑 Pattern" aria-label={`编辑 Pattern ${index + 1}`} disabled={busy} onclick={() => editPattern(index)}><Pencil size={16} /></button>
          <button class="icon-button danger" title="删除 Pattern" aria-label={`删除 Pattern ${index + 1}`} disabled={busy}
            onclick={() => { if (confirm("删除这条 Pattern？")) void run(() => api.deletePattern(index)); }}><Trash2 size={16} /></button>
        </div>
      </article>
    {:else}<p class="muted">暂无模式记录</p>{/each}
  </section>
</div>
{#if modal}
  <Modal title={modal === "spec" ? "编辑项目规范" : editIndex === null ? "新增 Pattern" : "编辑 Pattern"} {busy} onclose={() => modal = null}>
    <form onsubmit={saveContent}><fieldset disabled={busy} class="form-fields">
      <ErrorAlert {error} />
      <label>内容 <textarea rows="12" bind:value={content}></textarea></label>
      <footer class="form-actions"><button type="button" onclick={() => modal = null}>取消</button><button class="primary" disabled={modal === "pattern" && !content.trim()}><Save size={16} />保存</button></footer>
    </fieldset></form>
  </Modal>
{/if}

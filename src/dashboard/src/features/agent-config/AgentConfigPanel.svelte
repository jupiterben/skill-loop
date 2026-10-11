<script lang="ts">
  import { Pencil, Plus, Save, Trash2 } from "lucide-svelte";
  import { isAgentToolInstalled, type RunTool } from "../../../../domain/run-tool";
  import { agentProfileLabel, normalizeAgentModel } from "../../../../domain/agent-config";
  import type { AgentConfig, AgentProfile } from "../../types";
  import { api } from "../../lib/api";
  import { buildModelOptions } from "./modelOptions";
  import Modal from "../../components/Modal.svelte";
  import ErrorAlert from "../../components/ErrorAlert.svelte";
  type Draft = Omit<AgentProfile, "id"> & { id?: string };
  let { config, onRefresh, installedTools = [] }: {
    config: AgentConfig; onRefresh: () => Promise<void>; installedTools?: RunTool[];
  } = $props();
  let draft = $state<Draft | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let formError = $state<string | null>(null);
  let catalog = $state<{ tool: string; models: { id: string; name: string }[]; warning?: string } | null>(null);
  let loading = $state(false);
  let editingTool = $derived(draft?.adapter);
  $effect(() => {
    const tool = editingTool;
    if (!tool) return;
    const controller = new AbortController();
    loading = true;
    void api.getAgentModels(tool, controller.signal)
      .then((result) => { if (!controller.signal.aborted) catalog = { tool, ...result }; })
      .catch(() => { if (!controller.signal.aborted) catalog = { tool, models: [], warning: "无法读取模型列表" }; })
      .finally(() => { if (!controller.signal.aborted) loading = false; });
    return () => controller.abort();
  });
  async function mutate(operation: () => Promise<unknown>) {
    if (busy) return;
    busy = true; error = null;
    try { await operation(); await onRefresh(); }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; }
  }
  function edit(profile?: AgentProfile) {
    formError = null;
    const tool = installedTools.includes("codex") ? "codex" : installedTools[0];
    if (profile) draft = { ...profile, args: [...profile.args], envRefs: [...profile.envRefs] };
    else if (tool) draft = { name: "", adapter: tool, executable: null, model: null, args: [], timeoutMs: null, envRefs: [], enabled: true };
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    busy = true; formError = null;
    try {
      if (!draft.name.trim()) throw new Error("请填写配置名称");
      if (!isAgentToolInstalled(draft.adapter, installedTools)) throw new Error("该 CLI 未在本机找到");
      await api.saveAgentProfile({ ...draft, name: draft.name.trim(), model: normalizeAgentModel(draft.model) });
      draft = null;
      await onRefresh();
    } catch (cause) { formError = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; }
  }
</script>
<section class="agent-config page-section" aria-label="项目 Agent 配置">
  <header class="section-head"><h2>Agent 配置</h2><button class="primary" disabled={busy || !installedTools.length} onclick={() => edit()}><Plus size={17} />新建配置</button></header>
  <ErrorAlert {error} />
  {#if !installedTools.length}<p class="muted">未检测到本机 Agent CLI</p>{/if}
  <label class="default-agent">项目默认 Agent <select aria-label="项目默认 Agent" value={config.defaultProfileId ?? ""} disabled={busy}
    onchange={(e) => { const id = e.currentTarget.value; void mutate(() => api.setDefaultAgentProfile(id || null)); }}>
    <option value="">自动选择</option>
    {#each config.profiles as profile (profile.id)}
      <option value={profile.id} disabled={!profile.enabled || !isAgentToolInstalled(profile.adapter, installedTools)}>
        {agentProfileLabel(profile)}{!isAgentToolInstalled(profile.adapter, installedTools) ? " · 未安装" : ""}
      </option>
    {/each}
  </select></label>
  <div class="table-scroll"><table><thead><tr><th>名称</th><th>CLI</th><th>模型</th><th>启用</th><th>操作</th></tr></thead><tbody>
    {#each config.profiles as profile (profile.id)}<tr>
      <td><strong>{profile.name}</strong>{#if config.defaultProfileId === profile.id}<span class="badge success">默认</span>{/if}<code class="block">{profile.id}</code></td>
      <td>{profile.adapter}{#if !isAgentToolInstalled(profile.adapter, installedTools)}<small class="warning block">未安装</small>{/if}</td>
      <td>{profile.model ?? "CLI 默认模型"}</td>
      <td><input type="checkbox" role="switch" aria-label={`启用 ${profile.name}`} checked={profile.enabled}
        disabled={busy || config.defaultProfileId === profile.id} onchange={(e) => { const enabled = e.currentTarget.checked; void mutate(() => api.saveAgentProfile({ ...profile, enabled })); }} /></td>
      <td><div class="actions">
        <button class="icon-button" title="编辑" aria-label={`编辑 ${profile.name}`} disabled={busy} onclick={() => edit(profile)}><Pencil size={16} /></button>
        <button class="icon-button danger" title="删除" aria-label={`删除 ${profile.name}`} disabled={busy}
          onclick={() => { if (confirm(`删除「${profile.name}」？`)) void mutate(() => api.deleteAgentProfile(profile.id)); }}><Trash2 size={16} /></button>
      </div></td>
    </tr>{:else}<tr><td colspan="5" class="muted">暂无 Agent 配置</td></tr>{/each}
  </tbody></table></div>
</section>
{#if draft}
  <Modal title={draft.id ? "编辑 Agent 配置" : "新建 Agent 配置"} {busy} onclose={() => draft = null}>
    <form onsubmit={save}><fieldset disabled={busy} class="form-fields">
      <ErrorAlert error={formError} />
      <label>配置名称 <input required maxlength="100" bind:value={draft.name} /></label>
      <label>Agent CLI <select bind:value={draft.adapter} onchange={() => { if (draft) draft.model = null; }}>
        {#if !installedTools.includes(draft.adapter)}<option value={draft.adapter} disabled>{draft.adapter} · 未安装</option>{/if}
        {#each installedTools as tool (tool)}<option value={tool}>{tool}</option>{/each}
      </select></label>
      <label>模型 <input list="agent-models" value={draft.model ?? ""} oninput={(e) => { if (draft) draft.model = e.currentTarget.value || null; }} /></label>
      <datalist id="agent-models">{#each buildModelOptions(catalog?.tool === draft.adapter ? catalog.models : [], draft.model, "") as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</datalist>
      {#if loading}<small role="status">加载模型...</small>{/if}
      {#if catalog?.tool === draft.adapter && catalog.warning}<p class="warning">{catalog.warning}</p>{/if}
      <label class="inline-label"><input type="checkbox" bind:checked={draft.enabled} disabled={Boolean(draft.id && draft.id === config.defaultProfileId)} />启用</label>
      <footer class="form-actions"><button type="button" onclick={() => draft = null}>取消</button><button type="submit" class="primary"><Save size={16} />保存配置</button></footer>
    </fieldset></form>
  </Modal>
{/if}

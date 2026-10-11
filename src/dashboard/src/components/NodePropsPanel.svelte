<script lang="ts">
  import { ArrowDown, ArrowUp, Archive, Check, Folder, ListTodo, Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-svelte";
  import type { DashboardData, Feature, PreferredTool, SelectedMindMapNode, StoryWorkType, UserStory } from "../types";
  import { api } from "../lib/api";
  import { parseAcceptanceCriteria } from "../lib/acceptanceCriteria";
  import { canArchiveStory, canCancelRemoval, canDeleteFeature, canHardDeleteStory, canPurgeStory, canRequestRemoval, canRestoreStory } from "../lib/deletable";
  import { featureReorderState, storyReorderState } from "../lib/reorder";
  import { STORY_WORK_TYPE_OPTIONS } from "../features/story-work-type/storyWorkType";
  import { agentSelectionLabel, agentSelectionOptions, agentSelectionValue } from "../features/agent-config/agentSelection";
  import { emptyAgentConfig } from "../../../domain/agent-config";
  import { computeStoryEditDirty } from "../features/story-props-edit/storyEdit";
  import ProgressLog from "./ProgressLog.svelte";
  import Modal from "./Modal.svelte";
  import ErrorAlert from "./ErrorAlert.svelte";
  let { data, selected, busy, run, onSelect, error }: {
    data: DashboardData; selected: SelectedMindMapNode | null; busy: boolean; error?: string | null;
    run: (operation: () => Promise<unknown>) => Promise<boolean>;
    onSelect: (node: SelectedMindMapNode) => void;
  } = $props();
  let feature = $derived(data.features.find((item) => item.id === selected?.id));
  let story = $derived([...data.userStories, ...data.archivedStories].find((item) => item.id === selected?.id));
  type Draft = { title: string; description: string; workType: StoryWorkType; acceptanceCriteria: string; changeNote: string };
  let draft = $state<Draft | null>(null);
  let editing = $state(false);
  let baseline = $derived<Draft>({
    title: feature?.title ?? story?.title ?? "",
    description: feature?.description ?? story?.description ?? "",
    workType: story?.workType ?? "implementation",
    acceptanceCriteria: story?.acceptanceCriteria.join("\n") ?? "",
    changeNote: "",
  });
  let fields = $derived(draft ?? baseline);
  let dirty = $derived(story
    ? computeStoryEditDirty({ ...fields, acceptanceCriteria: parseAcceptanceCriteria(fields.acceptanceCriteria) }, story) || Boolean(fields.changeNote)
    : fields.title !== baseline.title || fields.description !== baseline.description);
  let reason = $state("");
  let summary = $state("");
  let completing = $state(false);
  let dependencyId = $state("");
  let config = $derived(data.agentConfig ?? emptyAgentConfig());
  let options = $derived(agentSelectionOptions(config, data.installedAgentTools, true));
  let agentValue = $derived(story ? agentSelectionValue(story) : "");
  let inbound = $derived(data.dependencies.filter((dep) => dep.to === story?.id));
  let outbound = $derived(data.dependencies.filter((dep) => dep.from === story?.id));
  let blocked = $derived(inbound.some((dep) => !data.userStories.find((item) => item.id === dep.from)?.passes));
  let reorder = $derived(feature ? featureReorderState(feature.id, data.features) : story ? storyReorderState(story.id, data.userStories) : null);
  function change(patch: Partial<Draft>) { draft = { ...fields, ...patch }; }
  async function save(status: "draft" | "ready") {
    const succeeded = await run(() => feature ? api.updateFeature({ id: feature.id, title: fields.title.trim(), description: fields.description }) :
      api.updateStory({ storyId: story!.id, title: fields.title.trim(), description: fields.description,
        workType: fields.workType, acceptanceCriteria: parseAcceptanceCriteria(fields.acceptanceCriteria),
        changeNote: fields.changeNote.trim() || undefined, status }));
    if (succeeded) { draft = null; editing = false; }
  }
  function selectStory(item: UserStory) {
    onSelect({ id: item.id, kind: item.archivedAt ? "archived" : item.passes ? "done" : item.status === "draft" ? "draft" : "story" });
  }
  function confirmRun(message: string, operation: () => Promise<unknown>) {
    if (confirm(message)) void run(operation);
  }
  function assignAgent(value: string) {
    if (!story) return;
    const id = story.id;
    void run(() => value.startsWith("tool:") ? api.setStoryPreferredTool(id, value.slice(5) as PreferredTool) :
      api.setStoryAgentProfile(id, value.startsWith("profile:") ? value.slice(8) : null));
  }
  function availableParents(item: Feature | UserStory) {
    const excluded = new Set([item.id]);
    if (feature) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const candidate of data.features) {
          if (candidate.parentId && excluded.has(candidate.parentId) && !excluded.has(candidate.id)) { excluded.add(candidate.id); changed = true; }
        }
      }
    }
    return data.features.filter((candidate) => !excluded.has(candidate.id));
  }
</script>

<aside class="props-panel" aria-label="节点属性">
  {#if !selected || selected.kind === "root"}
    <header><small>项目</small><h2>{data.status.project}</h2></header>
    <dl><dt>进度</dt><dd>{data.status.completedStories}/{data.status.totalStories}</dd><dt>Features</dt><dd>{data.features.length}</dd><dt>Stories</dt><dd>{data.userStories.length}</dd></dl>
    <details open><summary>回收站 ({data.archivedStories.length})</summary>
      {#each data.archivedStories as item (item.id)}<button class="list-button" onclick={() => selectStory(item)}><code>{item.id}</code>{item.title}</button>{:else}<p class="muted">暂无归档</p>{/each}
    </details>
  {:else if feature || story}
    <header class="story-heading" class:story-heading--feature={Boolean(feature)}>
      <div class="detail-type" class:detail-type--feature={Boolean(feature)}>
        {#if feature}<Folder size={19} /><span>Feature · 功能分组</span>
        {:else}<ListTodo size={19} /><span>Story · 任务</span>{/if}
      </div>
      <div class="story-heading__meta"><code>{selected.id}</code>
      <small class="badge">{feature ? "Feature" : story?.archivedAt ? "Story · 已归档" : story?.removalRequestedAt ? "Story · 等待删除" : story?.passes ? "Story · 已完成" : story?.status === "draft" ? "Story · 草稿" : blocked ? "Story · 阻塞" : "Story · 可执行"}</small></div>
      <h2>{fields.title}</h2>
      {#if story?.parentId}<button class="story-feature text-button" onclick={() => onSelect({ id: story!.parentId!, kind: "feature" })}>{data.features.find((item) => item.id === story!.parentId)?.title ?? story.parentId}</button>{/if}
    </header>
    {#if story?.archivedAt}
      <p class="pre-wrap">{story.description}</p>
      <div class="actions">
        {#if canRestoreStory(story)}<button disabled={busy} onclick={() => run(() => api.restoreStory(story!.id))}><RotateCcw size={15} />恢复</button>{/if}
        {#if canPurgeStory(story)}<button class="danger" disabled={busy} onclick={() => confirmRun("永久删除该 Story 及全部进度记录？不可恢复。", () => api.purgeStory(story!.id))}><Trash2 size={15} />永久删除</button>{/if}
      </div>
    {:else}
      {#if feature}
        {#if canDeleteFeature(feature.id, data.features, data.userStories)}<p class="warning">空叶子 Feature · 无可执行 Story</p>{/if}
      {/if}
      {#if !editing}
        <div class="story-primary-actions">
          {#if story && !story.passes && !story.removalRequestedAt}
            {#if story.status === "draft"}<button class="primary" disabled={busy} onclick={() => run(() => api.confirmStory(story!.id))}><Check size={16} />确认可执行</button>
            {:else if !blocked}<button class="primary" disabled={busy} onclick={() => { summary = ""; completing = true; }}><Check size={16} />标记完成</button>{/if}
          {/if}
          <button disabled={busy} onclick={() => editing = true}><Pencil size={15} />编辑</button>
        </div>
        <section class="story-overview"><h3>{feature ? "功能范围" : "需求目标"}</h3><p>{fields.description || "暂无描述"}</p></section>
        {#if story}
          <section class="story-acceptance"><h3>验收标准 <span>{story.acceptanceCriteria.length}</span></h3>
            <ol>{#each story.acceptanceCriteria as criterion, index (index)}<li><span class="criterion-index">{index + 1}</span><span>{criterion}</span></li>{:else}<li class="muted">暂无验收标准</li>{/each}</ol>
          </section>
          <dl class="story-facts"><dt>类型</dt><dd>{STORY_WORK_TYPE_OPTIONS.find((item) => item.value === story!.workType)?.label}</dd>
            <dt>优先级</dt><dd>P{story.priority}</dd><dt>Milestone</dt><dd>{data.milestones.find((item) => item.id === story!.milestoneId)?.title ?? "未安排"}</dd>
            <dt>Agent</dt><dd>{agentSelectionLabel(agentValue, config, data.installedAgentTools ?? [])}</dd></dl>
        {/if}
      {:else}
      <section class="story-editor"><header class="section-head"><h3>编辑{feature ? " Feature" : " Story"}</h3>
        <button class="icon-button" aria-label="取消编辑" title="取消编辑" disabled={busy} onclick={() => { draft = null; editing = false; }}><X size={16} /></button></header>
        <form onsubmit={(event) => { event.preventDefault(); void save(story?.status ?? "draft"); }}>
          <fieldset disabled={busy} class="form-fields">
            <label>标题 <input required value={fields.title} oninput={(e) => change({ title: e.currentTarget.value })} /></label>
            <label>描述 <textarea rows="4" value={fields.description} oninput={(e) => change({ description: e.currentTarget.value })}></textarea></label>
            {#if story}
              <label>类型 <select value={fields.workType} onchange={(e) => change({ workType: e.currentTarget.value as StoryWorkType })}>{#each STORY_WORK_TYPE_OPTIONS as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</select></label>
              <label>验收标准 <textarea rows="4" value={fields.acceptanceCriteria} oninput={(e) => change({ acceptanceCriteria: e.currentTarget.value })}></textarea></label>
              <label>变更说明 <textarea rows="2" value={fields.changeNote} oninput={(e) => change({ changeNote: e.currentTarget.value })}></textarea></label>
            {/if}
            {#if draft}<small class="warning">有未保存的修改</small><button type="button" onclick={() => draft = null}>放弃修改</button>{/if}
            <button class="primary" disabled={!fields.title.trim() || (!dirty && !story?.passes)}><Save size={15} />{story?.passes ? "保存为待实现" : "保存"}</button>
            {#if story && (draft || story.passes)}<button type="button" disabled={!fields.title.trim()} onclick={() => save("draft")}>保存为草稿</button>{/if}
          </fieldset>
        </form>
      </section>
      {/if}
      <details><summary>安排与分组</summary><fieldset disabled={busy || Boolean(draft)} class="form-fields">
        <label>父级 Feature <select value={(feature ?? story)!.parentId ?? ""} onchange={(e) => {
          const parentId = e.currentTarget.value || null;
          void run(() => api.moveMindMapItem({ id: selected!.id, kind: feature ? "feature" : "story", parentId }));
        }}><option value="">项目根目录</option>{#each availableParents((feature ?? story)!) as parent (parent.id)}<option value={parent.id}>{parent.id} · {parent.title}</option>{/each}</select></label>
        <div class="actions">
          <button type="button" class="icon-button" title="上移" aria-label="上移" disabled={!reorder?.canMoveUp} onclick={() => run(() => api.reorderMindMapItem({ id: selected!.id, kind: feature ? "feature" : "story", direction: "up" }))}><ArrowUp size={16} /></button>
          <button type="button" class="icon-button" title="下移" aria-label="下移" disabled={!reorder?.canMoveDown} onclick={() => run(() => api.reorderMindMapItem({ id: selected!.id, kind: feature ? "feature" : "story", direction: "down" }))}><ArrowDown size={16} /></button>
        </div>
        {#if story}
          <label>优先级 <input type="number" min="0" step="1" value={story.priority} onchange={(e) => {
            const input = e.currentTarget;
            if (input.value && input.checkValidity()) void run(() => api.setStoryPriority(story!.id, Number(input.value)));
            else input.value = String(story!.priority);
          }} /></label>
          <label>Story 执行 Agent <select value={agentValue} disabled={Boolean(story.claimedBy)} onchange={(e) => assignAgent(e.currentTarget.value)}>
            {#if !options.some((option) => option.value === agentValue)}<option value={agentValue} disabled>{agentSelectionLabel(agentValue, config, data.installedAgentTools ?? [])}</option>{/if}
            {#each options as option (option.value)}<option value={option.value} disabled={"disabled" in option && option.disabled}>{option.label}</option>{/each}
          </select></label>
          <label>Milestone <select value={story.milestoneId ?? ""} onchange={(e) => { const id = e.currentTarget.value; void run(() => api.setStoryMilestone(story!.id, id || null)); }}>
            <option value="">未安排</option>{#each data.milestones as milestone (milestone.id)}<option value={milestone.id}>{milestone.title}</option>{/each}
          </select></label>
          {#if !story.passes && !story.removalRequestedAt}
            {#if story.status === "ready"}<button type="button" onclick={() => run(() => api.unconfirmStory(story!.id))}><RotateCcw size={15} />退回草稿</button>{/if}
          {/if}
        {/if}
      </fieldset></details>
      {#if story}
        <details><summary>依赖关系 ({inbound.length + outbound.length})</summary><fieldset disabled={busy || Boolean(draft)} class="form-fields">
          <label>前置 Story <select bind:value={dependencyId}><option value="">选择前置 Story</option>
            {#each data.userStories.filter((item) => item.id !== story!.id && !inbound.some((dep) => dep.from === item.id)) as item (item.id)}<option value={item.id}>{item.id} · {item.title}</option>{/each}
          </select></label>
          <button type="button" disabled={!dependencyId} onclick={async () => { if (await run(() => api.addDependency(dependencyId, story!.id))) dependencyId = ""; }}><Plus size={15} />添加依赖</button>
          {#each [...inbound, ...outbound] as dep (`${dep.from}-${dep.to}`)}
            <div class="dependency-row"><span>{dep.from} → {dep.to}</span><button type="button" class="icon-button danger" title="移除依赖" aria-label={`移除依赖 ${dep.from} ${dep.to}`} onclick={() => confirmRun("移除该依赖关系？", () => api.removeDependency(dep.from, dep.to))}><X size={15} /></button></div>
          {/each}
          {#if story.notes}<p class="pre-wrap">{story.notes}</p>{/if}
        </fieldset></details>
        <details><summary>生命周期</summary><fieldset disabled={busy || Boolean(draft)} class="form-fields">
          <label>说明 <textarea rows="2" bind:value={reason}></textarea></label>
          {#if canRequestRemoval(story, data.progress)}<button type="button" class="danger" onclick={() => confirmRun("标记该 Story 为等待删除？代码需由后续迭代回滚。", () => api.requestStoryRemoval(story!.id, reason))}><Trash2 size={15} />标记等待删除</button>{/if}
          {#if canCancelRemoval(story)}<button type="button" onclick={() => run(() => api.cancelStoryRemoval(story!.id))}><RotateCcw size={15} />取消删除</button>{/if}
          {#if canArchiveStory(story, data.progress)}<button type="button" class="danger" onclick={() => confirmRun("归档该 Story？将从脑图移除，保留进度。", () => api.archiveStory(story!.id, reason))}><Archive size={15} />归档</button>{/if}
          {#if canHardDeleteStory(story.id, data.userStories, data.progress)}<button type="button" class="danger" onclick={() => confirmRun("删除该 Story？", () => api.deleteStory(story!.id))}><Trash2 size={15} />删除 Story</button>{/if}
        </fieldset></details>
      {:else if feature}
        <details open><summary>子节点</summary>
          {#each data.features.filter((item) => item.parentId === feature!.id) as child (child.id)}<button class="list-button" onclick={() => onSelect({ id: child.id, kind: "feature" })}>{child.title}</button>{/each}
          {#each data.userStories.filter((item) => item.parentId === feature!.id) as child (child.id)}<button class="list-button" onclick={() => selectStory(child)}><code>{child.id}</code>{child.title}</button>{/each}
        </details>
        {#if canDeleteFeature(feature.id, data.features, data.userStories)}<button class="danger" disabled={busy || Boolean(draft)} onclick={() => confirmRun("删除这个空 Feature？", () => api.deleteFeature(feature!.id))}><Trash2 size={15} />删除 Feature</button>{/if}
      {/if}
    {/if}
    {#if story}<details><summary>进度日志</summary><ProgressLog entries={data.progress.filter((entry) => entry.storyId === story!.id)} /></details>{/if}
  {:else}<p class="muted">节点已不存在</p>{/if}
</aside>
{#if completing && story}
  <Modal title={`标记完成 · ${story.id}`} {busy} onclose={() => completing = false}>
    <form onsubmit={async (event) => { event.preventDefault(); if (await run(() => api.completeStory({ storyId: story!.id, summary: summary.trim() }))) completing = false; }}>
      <fieldset disabled={busy} class="form-fields"><ErrorAlert {error} /><label>完成说明 <textarea rows="4" required bind:value={summary}></textarea></label>
        <button class="primary" disabled={!summary.trim()}><Check size={16} />确认完成</button>
      </fieldset>
    </form>
  </Modal>
{/if}

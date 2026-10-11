<script lang="ts">
  import { tick, untrack } from "svelte";
  import { Background, Controls, SvelteFlow, type Node, type Edge, type Connection } from "@xyflow/svelte";
  import { Check, PanelLeftClose, PanelLeftOpen, Plus, Trash2 } from "lucide-svelte";
  import type { DashboardData, SelectedMindMapNode, StoryWorkType } from "../types";
  import { api } from "../lib/api";
  import { buildProjectMindMap, MINDMAP_ROOT_ID, isDependencyEdge, depEdgeMarker, depEdgeStrokeColor, type MindMapNodeData } from "../lib/mindmapLayout";
  import { filterTreeByMilestone, MILESTONE_NONE } from "../lib/treeFilter";
  import { resolveRunningStoryIds } from "../lib/runningStories";
  import { canDeleteFeature, canHardDeleteStory, isFormFieldFocused } from "../lib/deletable";
  import { buildMindMapNavIndex, navigateMindMapNode, type NavDirection } from "../lib/mindmapKeyboardNav";
  import { featureReorderState, storyReorderState } from "../lib/reorder";
  import { dropTargetToParentId, findNodesAtDragCenter, isDropTargetKind, isReparentableKind, reparentItemKind, resolveDropTargetId } from "../lib/mindmapReparent";
  import { DEFAULT_ACCEPTANCE_CRITERIA, parseAcceptanceCriteria } from "../lib/acceptanceCriteria";
  import { STORY_WORK_TYPE_OPTIONS } from "../features/story-work-type/storyWorkType";
  import MindMapNode from "./MindMapNode.svelte";
  import DepEdge from "./DepEdge.svelte";
  import FlowViewport from "./FlowViewport.svelte";
  import NodePropsPanel from "./NodePropsPanel.svelte";
  import ProjectTreeView from "./ProjectTreeView.svelte";
  import SplitPane from "./SplitPane.svelte";
  import Modal from "./Modal.svelte";
  import ErrorAlert from "./ErrorAlert.svelte";
  import { resolveTreeAction } from "../lib/treeActions";
  import AddNodeMenu from "./AddNodeMenu.svelte";

  let { data, focusNode, active, onRefresh }: {
    data: DashboardData; focusNode: SelectedMindMapNode | null; active: boolean; onRefresh: () => Promise<void>;
  } = $props();
  const nodeTypes = { mindmap: MindMapNode };
  const edgeTypes = { dep: DepEdge };
  let selected = $state<SelectedMindMapNode | null>({ id: MINDMAP_ROOT_ID, kind: "root" });
  let selectedEdge = $state<string | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let filter = $state<string | null>(null);
  let collapsed = $state<Set<string>>(new Set());
  let heights = $state<Record<string, number>>({});
  let dragging = $state(false);
  let showTree = $state(true);
  let canvas: HTMLDivElement;
  let canvasWidth = $state(0);
  let canvasHeight = $state(0);
  let nodes = $state.raw<Node<MindMapNodeData>[]>([]);
  let edges = $state.raw<Edge[]>([]);
  let create = $state<{ kind: "feature" | "story"; parentId?: string } | null>(null);
  let title = $state("");
  let description = $state("");
  let createParentId = $state("");
  let workType = $state<StoryWorkType>("implementation");
  let criteria = $state("");
  let milestoneId = $state("");
  let milestone = $state<{ id?: string; title: string; targetDate: string; version: string } | null>(null);
  let runningIds = $derived(resolveRunningStoryIds(data));
  let pct = $derived(data.status.totalStories ? Math.round(data.status.completedStories / data.status.totalStories * 100) : 0);
  let tree = $derived(filterTreeByMilestone(data.tree, data.userStories, filter));
  let layout = $derived(buildProjectMindMap(data.status.project, pct, tree, data.dependencies, collapsed, heights));
  let nav = $derived(buildMindMapNavIndex(tree, collapsed));
  let drafts = $derived(data.userStories.filter((story) => story.status === "draft" && !story.passes));

  async function run(operation: () => Promise<unknown>): Promise<boolean> {
    if (busy) return false;
    busy = true; error = null;
    try {
      await operation();
      await onRefresh();
      await tick();
      if (selected && selected.kind !== "root" &&
        ![...data.features, ...data.userStories, ...data.archivedStories].some((item) => item.id === selected?.id)) {
        selected = { id: MINDMAP_ROOT_ID, kind: "root" };
      }
      if (selectedEdge && !data.dependencies.some((dep) => `dep:${dep.from}->${dep.to}` === selectedEdge)) selectedEdge = null;
      return true;
    }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); return false; }
    finally { busy = false; }
  }
  function select(node: SelectedMindMapNode) { selected = node; selectedEdge = null; }
  function treeAction(node: SelectedMindMapNode) {
    if (busy) return;
    const action = resolveTreeAction(node, data, runningIds);
    if (!action || action.disabled) return;
    const title = [...data.features, ...data.userStories].find((item) => item.id === node.id)?.title ?? node.id;
    const detail = action.kind === "request-removal"
      ? "将标记为等待删除，不会直接移除。需回滚代码后再归档。"
      : action.kind === "archive"
        ? "将从需求地图移除，保留进度记录。若需回滚代码，请先确认已完成。"
        : "此操作不可撤销。";
    if (!confirm(`${action.label}「${node.id} · ${title}」？\n${detail}`)) return;
    void run(() => action.kind === "delete-feature" ? api.deleteFeature(node.id)
      : action.kind === "delete-story" ? api.deleteStory(node.id)
      : action.kind === "request-removal" ? api.requestStoryRemoval(node.id)
      : api.archiveStory(node.id));
  }
  function toggle(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    collapsed = next;
  }
  function reportHeight(id: string, height: number) {
    if (heights[id] !== height) heights = { ...heights, [id]: height };
  }
  function openCreate(kind: "feature" | "story", parentId?: string) {
    title = ""; description = ""; criteria = DEFAULT_ACCEPTANCE_CRITERIA.join("\n");
    workType = "implementation"; milestoneId = filter && filter !== MILESTONE_NONE ? filter : "";
    error = null; create = { kind, parentId };
    createParentId = parentId ?? "";
  }
  $effect(() => {
    if (!focusNode) return;
    const focus = focusNode;
    untrack(() => { select(focus); filter = null; collapsed = new Set(); });
  });
  // Keep the graph library's mutable positions separate from server-owned layout.
  $effect(() => {
    if (dragging) return;
    nodes = layout.nodes.map((node) => {
      const story = data.userStories.find((item) => item.id === node.id);
      const empty = node.data.kind === "feature" && canDeleteFeature(node.id, data.features, data.userStories);
      return { ...node, selected: selected?.id === node.id, draggable: !busy && isReparentableKind(node.data.kind),
        deletable: false, data: {
          ...node.data, showDepHandles: Boolean(node.data.connectable) && !busy,
          isRunning: runningIds.has(node.id) && !story?.passes,
          emptyLeafWarning: empty, sublabel: empty ? "无可执行 Story" : node.data.sublabel,
          onHeightChange: reportHeight, onToggleCollapse: () => toggle(node.id),
          confirmable: !busy && node.id === selected?.id && story?.status === "draft" && !story.passes,
          onConfirmDraft: () => void run(() => api.confirmStory(node.id)),
          unconfirmable: !busy && node.id === selected?.id && story?.status === "ready" && !story.passes && !story.removalRequestedAt,
          onUnconfirmDraft: () => void run(() => api.unconfirmStory(node.id)),
          onRenameTitle: node.data.kind === "feature" && !busy ? (value: string) => void run(() => api.updateFeature({ id: node.id, title: value })) : undefined,
        } };
    });
  });
  $effect(() => {
    edges = layout.edges.map((edge) => isDependencyEdge(edge) ? { ...edge, selected: selectedEdge === edge.id,
      markerEnd: depEdgeMarker(depEdgeStrokeColor(selectedEdge === edge.id)) } : edge);
  });
  async function submitCreate(event: SubmitEvent) {
    event.preventDefault();
    if (!create) return;
    const input = create;
    const succeeded = await run(async () => {
      const response = input.kind === "feature"
        ? await api.addFeature({ title: title.trim(), description, parentId: createParentId || null })
        : await api.addStory({ title: title.trim(), description, parentId: createParentId || null, workType,
          acceptanceCriteria: parseAcceptanceCriteria(criteria), milestoneId: milestoneId || null });
      const item = response[input.kind] as { id: string };
      select({ id: item.id, kind: input.kind === "feature" ? "feature" : "draft" });
      filter = null; collapsed = new Set();
    });
    if (succeeded) create = null;
  }
  async function submitMilestone(event: SubmitEvent) {
    event.preventDefault();
    if (!milestone) return;
    const input = { ...milestone, title: milestone.title.trim() };
    if (await run(() => input.id ? api.updateMilestone(input.id, input) : api.addMilestone(input))) milestone = null;
  }
  function validConnection(connection: Connection | Edge) {
    return !busy && connection.source !== connection.target &&
      connection.sourceHandle === "dep-out" && connection.targetHandle === "dep-in" &&
      Boolean(nodes.find((node) => node.id === connection.source)?.data.connectable &&
        nodes.find((node) => node.id === connection.target)?.data.connectable);
  }
  function dragStop(node: Node<MindMapNodeData> | null) {
    if (node && !busy && isReparentableKind(node.data.kind)) {
      const candidates = findNodesAtDragCenter(node, nodes).filter((candidate) => isDropTargetKind((candidate.data as MindMapNodeData).kind));
      const targetId = resolveDropTargetId(candidates, node.id);
      const current = [...data.features, ...data.userStories].find((item) => item.id === node.id);
      if (targetId && current && current.parentId !== dropTargetToParentId(targetId)) {
        void run(() => api.moveMindMapItem({ id: node.id, kind: reparentItemKind(node.data.kind as Exclude<MindMapNodeData["kind"], "root">), parentId: dropTargetToParentId(targetId) }));
      }
    }
    dragging = false;
  }
  function deleteSelection() {
    if (busy) return;
    if (selectedEdge) {
      const edge = edges.find((item) => item.id === selectedEdge);
      if (edge && confirm("移除该依赖关系？")) void run(() => api.removeDependency(edge.source, edge.target));
    } else if (selected) {
      const node = selected;
      const deletable = node.kind === "feature" ? canDeleteFeature(node.id, data.features, data.userStories) : canHardDeleteStory(node.id, data.userStories, data.progress);
      if (deletable && confirm("删除选中节点？")) void run(() => node.kind === "feature" ? api.deleteFeature(node.id) : api.deleteStory(node.id));
    }
  }
  function keydown(event: KeyboardEvent) {
    if (isFormFieldFocused() || busy || create || milestone) return;
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelection(); return; }
    const direction = event.key === "PageUp" ? "up" : event.key === "PageDown" ? "down" : null;
    if (direction && selected && selected.kind !== "root" && selected.kind !== "archived") {
      const kind = selected.kind === "feature" ? "feature" : "story";
      const state = kind === "feature" ? featureReorderState(selected.id, data.features) : storyReorderState(selected.id, data.userStories);
      event.preventDefault();
      if (direction === "up" ? state.canMoveUp : state.canMoveDown) void run(() => api.reorderMindMapItem({ id: selected!.id, kind, direction }));
      return;
    }
    const keys: Record<string, NavDirection> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    if (keys[event.key]) {
      event.preventDefault();
      const id = navigateMindMapNode(selected?.id ?? null, keys[event.key], nav);
      const node = nodes.find((item) => item.id === id);
      if (node) select({ id: node.id, kind: node.data.kind });
    }
  }
</script>

<div class="mindmap-panel">
  <div class="milestone-bar">
    <button class="icon-button" title={showTree ? "收起结构树" : "展开结构树"} aria-label={showTree ? "收起结构树" : "展开结构树"} onclick={() => showTree = !showTree}>{#if showTree}<PanelLeftClose size={17} />{:else}<PanelLeftOpen size={17} />{/if}</button>
    <span>Milestone</span><button class="chip" aria-pressed={filter === null} onclick={() => filter = null}>全部</button>
    {#each data.milestones as item (item.id)}
      <button class="chip" aria-pressed={filter === item.id} title={`${item.version ?? ""} ${item.targetDate ?? ""} · 双击编辑`}
        onclick={() => filter = item.id} ondblclick={() => { error = null; milestone = { id: item.id, title: item.title, version: item.version ?? "", targetDate: item.targetDate ?? "" }; }}>{item.title}</button>
    {/each}
    <button class="chip" aria-pressed={filter === MILESTONE_NONE} onclick={() => filter = MILESTONE_NONE}>未安排</button>
    <button class="icon-button" title="新建 Milestone" aria-label="新建 Milestone" disabled={busy} onclick={() => { error = null; milestone = { title: "", version: "", targetDate: "" }; }}><Plus size={17} /></button>
  </div>
  {#if !create && !milestone}<ErrorAlert {error} onclose={() => error = null} />{/if}
  <div class="mindmap-workspace">
    {#if showTree}
      <SplitPane storageKey="loop-tree-split" initial={220} max={420} label="调整结构树宽度">
        <div class="tree-panel"><header class="tree-panel__header"><h2>结构树</h2>
          <AddNodeMenu {busy} onCreate={(kind) => openCreate(kind, selected?.kind === "feature" ? selected.id : undefined)} />
        </header><ProjectTreeView projectTitle={data.status.project} progressPct={pct} {tree}
          selectedId={selected?.id ?? null} {runningIds} {busy} onSelect={select}
          actionFor={(node) => resolveTreeAction(node, data, runningIds)} onAction={treeAction} />
          {#if drafts.length}<details class="draft-list"><summary>待确认草稿 ({drafts.length})</summary>
            {#each drafts as story (story.id)}<div class="draft-row"><button class="text-button" onclick={() => select({ id: story.id, kind: "draft" })}>{story.title}</button><button class="icon-button" aria-label={`确认 ${story.id}`} title="确认可执行" disabled={busy} onclick={() => run(() => api.confirmStory(story.id))}><Check size={16} /></button></div>{/each}
          </details>{/if}
        </div>
      </SplitPane>
    {/if}
    <div class="canvas-column">
      {#if selectedEdge}<div class="canvas-edge-action"><button class="icon-button danger" title="移除依赖" aria-label="移除选中依赖" disabled={busy} onclick={deleteSelection}><Trash2 size={16} /></button></div>{/if}
      <!-- The graph owns arrow-key navigation; the adjacent structure tree is the native-control alternative. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div bind:this={canvas} bind:clientWidth={canvasWidth} bind:clientHeight={canvasHeight}
        class="mindmap-canvas" role="application" aria-label="需求脑图" tabindex="0" onkeydown={keydown}>
        <SvelteFlow bind:nodes bind:edges {nodeTypes} {edgeTypes} fitView minZoom={0.2} maxZoom={1.5}
          colorMode="dark" deleteKey={null} disableKeyboardA11y nodesFocusable={false}
          nodeDragThreshold={8} autoPanOnNodeFocus={false} autoPanOnNodeDrag={false} autoPanOnConnect={false}
          isValidConnection={validConnection}
          onbeforeconnect={(connection) => { if (validConnection(connection)) void run(() => api.addDependency(connection.source, connection.target)); return false; }}
          onnodeclick={({ node }) => { select({ id: node.id, kind: node.data.kind }); canvas.focus(); }}
          onpaneclick={() => { selectedEdge = null; selected = null; canvas.focus(); }}
          onedgeclick={({ edge }) => { if (isDependencyEdge(edge)) { selectedEdge = edge.id; selected = null; canvas.focus(); } }}
          onnodedragstart={() => dragging = true}
          onnodedragstop={({ targetNode }) => dragStop(targetNode)}>
          <Background gap={18} size={1} patternColor="var(--mm-grid)" />
          <Controls showLock={false} />
          <FlowViewport trigger={`${data.projectName}|${filter ?? ""}|${canvasWidth}|${canvasHeight}`}
            active={active && canvasWidth > 0 && canvasHeight > 0} focusId={focusNode?.id} />
        </SvelteFlow>
      </div>
    </div>
    <SplitPane storageKey="loop-story-detail-width" initial={350} min={280} max={480} label="调整属性面板宽度" trailing>
      {#key selected?.id ?? MINDMAP_ROOT_ID}
        <NodePropsPanel {data} {selected} {busy} {run} {error} onSelect={select} />
      {/key}
    </SplitPane>
  </div>
</div>
{#if create}
  <Modal title={create.kind === "feature" ? "新建 Feature" : "新建 Story"} {busy} onclose={() => create = null}>
    <form onsubmit={submitCreate}><fieldset disabled={busy} class="form-fields">
      <ErrorAlert {error} /><label>标题 <input required bind:value={title} /></label>
      <label>描述 <textarea rows="4" bind:value={description}></textarea></label>
      <label>所属 Feature <select bind:value={createParentId}>
        <option value="">项目根目录</option>
        {#each data.features as feature (feature.id)}<option value={feature.id}>{feature.id} · {feature.title}</option>{/each}
      </select></label>
      {#if create.kind === "story"}
        <label>验收标准 <textarea rows="3" bind:value={criteria}></textarea></label>
        <label>工作类型 <select bind:value={workType}>{#each STORY_WORK_TYPE_OPTIONS as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</select></label>
        <label>Milestone <select bind:value={milestoneId}><option value="">未安排</option>{#each data.milestones as item (item.id)}<option value={item.id}>{item.title}</option>{/each}</select></label>
      {/if}
      <footer class="form-actions"><button type="button" onclick={() => create = null}>取消</button><button class="primary" disabled={!title.trim()}><Plus size={16} />创建</button></footer>
    </fieldset></form>
  </Modal>
{/if}
{#if milestone}
  <Modal title={milestone.id ? "编辑 Milestone 标签" : "新建 Milestone 标签"} {busy} onclose={() => milestone = null}>
    <form onsubmit={submitMilestone}><fieldset disabled={busy} class="form-fields">
      <ErrorAlert {error} /><label>标签名称 <input required bind:value={milestone.title} /></label>
      <label>目标日期 <input type="date" bind:value={milestone.targetDate} /></label>
      <label>版本 <input bind:value={milestone.version} /></label>
      <footer class="form-actions"><button type="button" onclick={() => milestone = null}>取消</button><button class="primary" disabled={!milestone.title.trim()}>{milestone.id ? "保存" : "创建"}</button></footer>
    </fieldset></form>
  </Modal>
{/if}

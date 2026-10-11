<script lang="ts">
  import { onMount } from "svelte";
  import { Handle, Position, type Node, type NodeProps } from "@xyflow/svelte";
  import { Check, ChevronDown, ChevronRight, Folder, ListTodo, Network, RotateCcw } from "lucide-svelte";
  import type { MindMapNodeData } from "../lib/mindmapLayout";
  let { id, data, selected }: NodeProps<Node<MindMapNodeData>> = $props();
  let element: HTMLDivElement;
  let rename = $state<string | null>(null);
  onMount(() => {
    const report = () => { const height = Math.ceil(element.offsetHeight); if (height > 0) data.onHeightChange?.(id, height); };
    report();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(report);
    });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  });
  function submitRename() {
    const title = rename?.trim();
    rename = null;
    if (title && title !== data.label) data.onRenameTitle?.(title);
  }
  function focus(input: HTMLInputElement) { input.focus(); input.select(); }
</script>
<div bind:this={element} class={`mm-node mm-node--${data.kind}`} class:selected class:running={data.isRunning} title={data.description}>
  <Handle type="target" position={Position.Left} class="tree-handle" isConnectable={false} />
  {#if data.collapsible}
    <button class="node-toggle nodrag nopan" title={data.collapsed ? "展开子节点" : "收起子节点"} aria-label={data.collapsed ? "展开子节点" : "收起子节点"}
      onclick={(event) => { event.stopPropagation(); data.onToggleCollapse?.(); }}>
      {#if data.collapsed}<ChevronRight size={14} />{:else}<ChevronDown size={14} />{/if}
    </button>
  {/if}
  <div class="node-type" class:node-type--feature={data.kind === "feature"}>
    {#if data.kind === "feature"}<Folder size={15} /><span>Feature</span>
    {:else if data.kind === "root"}<Network size={28} /><span>项目</span>
    {:else}<ListTodo size={15} /><span>Story</span>{/if}
  </div>
  {#if data.isRunning}<small class="node-running">执行中</small>{/if}
  {#if data.sublabel}<small class:warning={data.emptyLeafWarning}>{data.sublabel}</small>{/if}
  {#if data.kind !== "root"}<code>{data.storyId ?? id}</code>{/if}
  {#if rename !== null}
    <input use:focus class="nodrag nopan" aria-label="Feature 名称" bind:value={rename} onblur={submitRename}
      onkeydown={(event) => { event.stopPropagation(); if (event.key === "Enter") submitRename(); if (event.key === "Escape") rename = null; }} />
  {:else if data.onRenameTitle}
    <button class="node-label" title="双击改名" ondblclick={(event) => { event.stopPropagation(); rename = data.label; }}>{data.label}</button>
  {:else}<span class="node-label">{data.label}</span>{/if}
  {#if data.collapsed}<small>{data.childCount} 个子节点</small>{/if}
  {#if data.confirmable || data.unconfirmable}
    <div class="node-actions nodrag nopan">
      {#if data.confirmable}<button onclick={(event) => { event.stopPropagation(); data.onConfirmDraft?.(); }}><Check size={12} />确认可执行</button>{/if}
      {#if data.unconfirmable}<button onclick={(event) => { event.stopPropagation(); data.onUnconfirmDraft?.(); }}><RotateCcw size={12} />退回草稿</button>{/if}
    </div>
  {/if}
  <Handle type="source" position={Position.Right} id="tree" class="tree-handle" isConnectable={false} />
  {#if data.showDepHandles}
    <Handle type="target" position={Position.Right} id="dep-in" class="dep-handle dep-in" style="top: calc(50% - 7px)" isConnectableStart={false} title="接收依赖" />
    <Handle type="source" position={Position.Right} id="dep-out" class="dep-handle dep-out" style="top: calc(50% + 7px)" isConnectableEnd={false} title="添加依赖" />
  {/if}
</div>

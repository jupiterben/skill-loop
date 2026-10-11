<script lang="ts">
  import { Archive, ChevronDown, ChevronRight, Folder, ListTodo, Network, Trash2 } from "lucide-svelte";
  import { buildProjectTreeData, type ProjectTreeDataNode } from "../lib/treeViewData";
  import type { SelectedMindMapNode, TreeNode } from "../types";
  import type { TreeAction } from "../lib/treeActions";
  let { projectTitle, progressPct, tree, selectedId, runningIds, onSelect, actionFor, onAction, busy = false }: {
    projectTitle: string; progressPct: number; tree: TreeNode[]; selectedId: string | null;
    runningIds: ReadonlySet<string>; onSelect: (node: SelectedMindMapNode) => void;
    actionFor: (node: SelectedMindMapNode) => TreeAction | null;
    onAction: (node: SelectedMindMapNode) => void;
    busy?: boolean;
  } = $props();
  let collapsed = $state<Record<string, boolean>>({});
  let treeData = $derived(buildProjectTreeData(projectTitle, progressPct, tree, runningIds));
</script>
{#snippet rows(items: ProjectTreeDataNode[])}
  <ul class="tree-list">
    {#each items as item (item.key)}
      {@const node = { id: item.key, kind: item.meta.kind }}
      {@const action = actionFor(node)}
      <li><div class="tree-row" class:tree-row--feature={item.meta.kind === "feature"}
        class:tree-row--story={Boolean(item.meta.storyId)} class:selected={selectedId === item.key}>
        {#if item.children?.length}<button class="tree-toggle icon-button" title={collapsed[item.key] ? "展开" : "收起"} aria-label={`${collapsed[item.key] ? "展开" : "收起"} ${item.meta.label}`} aria-expanded={!collapsed[item.key]}
          onclick={() => collapsed[item.key] = !collapsed[item.key]}>{#if collapsed[item.key]}<ChevronRight size={14} />{:else}<ChevronDown size={14} />{/if}</button>{:else}<span class="tree-spacer"></span>{/if}
        <button class="tree-item" title={item.meta.label} aria-current={selectedId === item.key ? "true" : undefined}
          onclick={() => onSelect({ id: item.key, kind: item.meta.kind })}>
          {#if item.meta.kind === "root"}<Network size={14} />{:else if item.meta.kind === "feature"}<Folder size={16} class="feature-icon" />{:else}<ListTodo size={14} />{/if}
          <span class="tree-item__content">
            {#if item.meta.kind === "feature"}<span class="tree-type-label">Feature</span>
            {:else if item.meta.storyId}<span class="tree-type-label">Story</span>{/if}
            {#if item.meta.storyId}<code class="tree-item__id">{item.meta.storyId}</code>{/if}
            <span class="tree-item__title">{item.meta.label}</span>
            {#if item.meta.kind !== "feature"}<small class:success={item.meta.running}>{item.meta.running ? "运行中" : item.meta.sublabel}</small>{/if}
          </span>
        </button>
        {#if action}
          <span class="tree-action-wrap" title={action.label}>
            <button class="tree-action icon-button danger" title={action.label}
              aria-label={`${action.label} ${item.key}`} disabled={busy || action.disabled}
              onclick={() => onAction(node)}>
              {#if action.kind === "archive"}<Archive size={14} />{:else}<Trash2 size={14} />{/if}
            </button>
          </span>
        {/if}
      </div>
        {#if item.children?.length && !collapsed[item.key]}{@render rows(item.children)}{/if}
      </li>
    {/each}
  </ul>
{/snippet}
<nav aria-label="项目结构树">{@render rows(treeData)}</nav>

<script lang="ts">
  import { FilePlus2, FolderPlus, Plus } from "lucide-svelte";
  let { busy, onCreate }: { busy: boolean; onCreate: (kind: "feature" | "story") => void } = $props();
  const id = $props.id();
  let trigger: HTMLButtonElement;
  let menu: HTMLDivElement;
  let position = $state("");
  function place() {
    const rect = trigger.getBoundingClientRect();
    position = `left: ${Math.max(8, Math.min(rect.left, window.innerWidth - 188))}px; top: ${rect.bottom + 6}px`;
  }
  function create(kind: "feature" | "story") {
    menu.hidePopover();
    trigger.focus();
    onCreate(kind);
  }
</script>
<button bind:this={trigger} class="icon-button" title="手动新增" aria-label="手动新增"
  popovertarget={id} disabled={busy} onclick={place}><Plus size={17} /></button>
<div bind:this={menu} id={id} popover="auto" class="add-node-menu" style={position} aria-label="手动新增选项">
  <button disabled={busy} onclick={() => create("feature")}><FolderPlus size={16} />新建 Feature</button>
  <button disabled={busy} onclick={() => create("story")}><FilePlus2 size={16} />新建 Story</button>
</div>

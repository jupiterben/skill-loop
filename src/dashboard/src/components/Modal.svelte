<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { X } from "lucide-svelte";
  let { title, onclose, busy = false, children }: {
    title: string; onclose: () => void; busy?: boolean; children: Snippet;
  } = $props();
  let dialog: HTMLDialogElement;
  const id = $props.id();
  onMount(() => {
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  });
</script>

<dialog bind:this={dialog} aria-labelledby={id}
  oncancel={(event) => { event.preventDefault(); if (!busy) onclose(); }}>
  <header class="section-head"><h2 id={id}>{title}</h2>
    <button type="button" class="icon-button" title="关闭" aria-label="关闭" disabled={busy} onclick={onclose}><X size={18} /></button>
  </header>
  {@render children()}
</dialog>

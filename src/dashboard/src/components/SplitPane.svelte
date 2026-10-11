<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  let { storageKey, initial, min = 160, max = 480, label, children, trailing = false }: {
    storageKey: string; initial: number; min?: number; max?: number; label: string; children: Snippet; trailing?: boolean;
  } = $props();
  function load() {
    try {
      const values: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      const value = Array.isArray(values) ? values[0] : values;
      return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : initial;
    } catch { return initial; }
  }
  let size = $state(load());
  let start: { x: number; size: number } | null = null;
  function persist() { try { localStorage.setItem(storageKey, JSON.stringify([size, 0])); } catch { /* Storage is optional. */ } }
  function move(event: PointerEvent) { if (start) size = Math.max(min, Math.min(max, start.size + (event.clientX - start.x) * (trailing ? -1 : 1))); }
  function end() { if (start) { start = null; persist(); } }
  onMount(() => {
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); };
  });
</script>
<div class="split-pane" class:trailing style={`--pane-size: ${size}px`}>
  {@render children()}
  <button class="resize-handle" aria-label={label} title={label}
    onpointerdown={(event) => { event.preventDefault(); start = { x: event.clientX, size }; }}
    onkeydown={(event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = (event.key === "ArrowRight" ? 1 : -1) * (trailing ? -1 : 1);
        size = Math.max(min, Math.min(max, size + 20 * direction)); persist();
      }
    }}></button>
</div>

<script lang="ts">
  import { tick } from "svelte";
  import { useSvelteFlow } from "@xyflow/svelte";
  let { trigger, active, focusId }: { trigger: string; active: boolean; focusId?: string } = $props();
  const flow = useSvelteFlow();
  $effect(() => {
    trigger;
    if (!active) return;
    let cancelled = false;
    void tick().then(() => { if (!cancelled) void flow.fitView({ padding: 0.15, maxZoom: 1 }); });
    return () => { cancelled = true; };
  });
  $effect(() => {
    const id = focusId;
    if (!active || !id) return;
    let cancelled = false;
    void tick().then(() => { if (!cancelled) void flow.fitView({ nodes: [{ id }], maxZoom: 1, duration: 200 }); });
    return () => { cancelled = true; };
  });
</script>

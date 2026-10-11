<script lang="ts">
  import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/svelte";
  import { depEdgeStrokeColor } from "../lib/mindmapLayout";
  let { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, markerEnd }: EdgeProps = $props();
  let path = $derived(getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 16, offset: 28 })[0]);
</script>
<BaseEdge {id} {path} {markerEnd} interactionWidth={18} style={`stroke: ${depEdgeStrokeColor(Boolean(selected))}; stroke-width: ${selected ? 3 : 2.5}`} />

<script lang="ts">
  import type { ProgressEntry } from "../types";
  import { sortProgressEntries } from "../features/progress/sortProgressEntries";
  let { entries = [] }: { entries?: ProgressEntry[] } = $props();
</script>
{#each sortProgressEntries(entries) as entry, index (entry.id ?? `${entry.entryDate}-${entry.storyId}-${index}`)}
  <article class="progress-entry">
    <h3><time>{entry.entryDate}</time>{entry.storyId ? ` · ${entry.storyId}` : ""}</h3>
    <p>{entry.summary}</p>
    {#if entry.learnings?.length}<ul>{#each entry.learnings as learning, i (i)}<li>{learning}</li>{/each}</ul>{/if}
  </article>
{:else}<p class="muted">暂无记录</p>{/each}

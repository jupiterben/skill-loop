<script lang="ts">
  import { AlertCircle, X } from "lucide-svelte";
  let { error, onclose }: { error: string | null | undefined; onclose?: () => void } = $props();
</script>
{#if error}
  <div class="error-alert" role="alert"><AlertCircle size={16} /><span>{error}</span>
    {#if onclose}<button class="icon-button" title="关闭错误提示" aria-label="关闭错误提示" onclick={onclose}><X size={16} /></button>{/if}
  </div>
{/if}

<script lang="ts">
import type { Snippet } from 'svelte'

// What a template's URL shows, in a small browser frame.
let { url, children }: { url: string; children: Snippet } = $props()
</script>

<figure class="flex flex-col border border-line bg-card">
  <figcaption class="flex items-center gap-3 border-b border-divider bg-[#f7f6f9] px-3.5 py-2.5">
    <span class="flex gap-1.5" aria-hidden="true">
      {#each [1, 2, 3] as dot (dot)}<span class="size-[9px] rounded-full bg-line"></span>{/each}
    </span>
    <span class="font-mono text-[13px] leading-[18px] text-muted">{url}</span>
  </figcaption>
  {@render children()}
</figure>

<script lang="ts">
import type { Snippet } from 'svelte'

// One part of a docs page. Its h2 feeds "On this page"; `step` numbers it in violet.
let { id, title, step, children }: { id: string; title: string; step?: number; children: Snippet } =
  $props()
</script>

<section class="flex flex-col gap-4 pb-10">
  <h2 {id} class="flex scroll-mt-8 items-baseline gap-3 font-display text-2xl leading-8 font-medium tracking-[-0.02em] lg:text-[28px] lg:leading-[34px]">
    {#if step}<span class="text-lg text-violet lg:text-xl">{step}</span>{/if}
    {title}
  </h2>
  {@render children()}
</section>

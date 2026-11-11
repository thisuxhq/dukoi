<script lang="ts">
import PageActions from './PageActions.svelte'

// A docs page's title, the sentence under it, and Copy page.
let { title, lead }: { title: string; lead: string } = $props()
</script>

<header class="flex flex-col gap-4 pb-10">
  <div class="flex flex-col-reverse gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
    <h1 class="font-display text-[40px] leading-[44px] font-medium tracking-[-0.035em] lg:text-[56px] lg:leading-[60px]">{title}</h1>
    <div class="flex lg:pt-3"><PageActions /></div>
  </div>
  <p class="text-[17px] leading-7 lg:text-[19px] lg:leading-[30px]">{lead}</p>
</header>

<script lang="ts">
// A docs page's title and the sentence under it.
let { title, lead }: { title: string; lead: string } = $props()
</script>

<header class="flex flex-col gap-4 pb-10">
  <h1 class="font-display text-[40px] leading-[44px] font-medium tracking-[-0.035em] lg:text-[56px] lg:leading-[60px]">{title}</h1>
  <p class="text-[17px] leading-7 lg:text-[19px] lg:leading-[30px]">{lead}</p>
</header>

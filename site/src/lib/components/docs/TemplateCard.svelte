<script lang="ts">
import type { SiteTemplate } from '#lib/templates.js'
import Icon from '../Icon.svelte'

// One template on the Templates page: what it is, its init command, a link to its page.
let { template: t, wide = false }: { template: SiteTemplate; wide?: boolean } = $props()
</script>

<a
  href="/docs/templates/{t.id}"
  class="group flex flex-col justify-between gap-6 p-6 {t.tint} {wide ? 'md:col-span-2 lg:flex-row lg:items-end' : ''}"
>
  <div class="flex flex-col gap-3 {wide ? 'lg:max-w-[340px]' : ''}">
    <span class="grid size-11 place-items-center bg-white/70"><Icon name={t.icon} class="size-[22px] {t.ink}" /></span>
    <h3 class="font-display text-[22px] leading-7 font-medium tracking-[-0.01em] group-hover:underline">{t.name}</h3>
    <p class="text-[15px] leading-[23px] text-body">{t.description}.</p>
  </div>
  <code class="flex h-10 w-fit max-w-full items-center overflow-x-auto bg-white px-3.5 font-mono text-[13px] whitespace-pre"><span class="text-prompt">$&nbsp;</span>npx dukoi init {t.id}</code>
</a>

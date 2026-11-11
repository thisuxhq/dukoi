<script lang="ts">
import type { Snippet } from 'svelte'
import Icon from '../Icon.svelte'

// A short aside: a tip in lavender, or a warning in peach.
let {
  title,
  tone = 'tip',
  icon = tone === 'tip' ? 'information-circle' : 'alert-02',
  children,
}: { title: string; tone?: 'tip' | 'warning'; icon?: string; children: Snippet } = $props()
</script>

<aside class="flex gap-3.5 px-5 py-5 lg:px-[22px] {tone === 'tip' ? 'bg-lavender' : 'bg-peach'}">
  <Icon name={icon} class="size-[22px] {tone === 'tip' ? 'text-violet' : 'text-orange'}" />
  <div class="flex flex-col gap-1">
    <p class="text-[15px] leading-[22px] font-semibold text-ink">{title}</p>
    <p class="text-[15px] leading-[23px]">{@render children()}</p>
  </div>
</aside>

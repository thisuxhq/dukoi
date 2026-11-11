<script lang="ts">
import { APK } from '#lib/links.js'
import Icon from './Icon.svelte'

let { size = 'lg', class: className = '' }: { size?: 'lg' | 'md'; class?: string } = $props()
</script>

<a
  href={APK}
  class="flex items-center justify-center gap-2 rounded bg-violet font-semibold text-white transition-colors hover:bg-[#6a2fe0] {size === 'lg' ? 'h-[52px] text-base lg:h-14' : 'h-12 px-[22px] text-[15px]'} {className}"
>
  {#if size === 'lg'}<Icon name="download-04" class="size-5" />{/if}
  Get the APK
</a>

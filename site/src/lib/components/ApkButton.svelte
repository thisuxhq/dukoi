<script lang="ts">
import { APK } from '#lib/links.js'
import Icon from './Icon.svelte'

let {
  size = 'lg',
  tone = 'violet',
  class: className = '',
}: {
  size?: 'lg' | 'md'
  /** muted sits next to a violet button, so only one of them shouts */
  tone?: 'violet' | 'muted'
  class?: string
} = $props()
</script>

<a
  href={APK}
  class="apk-button pressable flex items-center justify-center gap-2 rounded font-semibold {tone === 'violet' ? 'bg-violet text-white hover:bg-[#6a2fe0]' : 'bg-card text-ink hover:bg-divider'} {size === 'lg' ? 'h-14 px-7 text-base lg:h-[60px] lg:text-[17px]' : 'h-12 px-[22px] text-[15px]'} {className}"
>
  {#if size === 'lg'}<Icon name="download-04" class="apk-download-icon size-5" />{/if}
  Get the APK
</a>

<script lang="ts">
import Icon from './Icon.svelte'

let {
  command,
  size = 'lg',
  tone = 'night',
  class: className = '',
}: {
  command: string
  /** lg: hero, md: closing block, sm: inside cards (no copy button) */
  size?: 'lg' | 'md' | 'sm'
  /** night on light backgrounds, raised on the dark closing block */
  tone?: 'night' | 'raised'
  class?: string
} = $props()

let copied = $state(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  await navigator.clipboard.writeText(command)
  copied = true
  clearTimeout(timer)
  timer = setTimeout(() => (copied = false), 1600)
}
</script>

<div
  class="flex items-center justify-between rounded text-white {tone === 'night' ? 'bg-night' : 'bg-night-raised'} {size === 'lg'
    ? 'h-14 gap-5 pr-2.5 pl-[18px] lg:h-[60px] lg:pr-3 lg:pl-[22px]'
    : size === 'md'
      ? 'h-[54px] gap-5 pr-2.5 pl-4 lg:h-[60px] lg:pr-3 lg:pl-5'
      : 'h-11 px-4 lg:h-12 lg:px-[18px]'} {className}"
>
  <code class="font-mono whitespace-pre {size === 'sm' ? 'text-sm lg:text-[15px]' : size === 'md' ? 'text-[15px] lg:text-[17px]' : 'text-base lg:text-lg'}"
    ><span class="text-prompt">$</span> {command}</code
  >
  {#if size !== 'sm'}
    <button
      type="button"
      onclick={copy}
      aria-label={copied ? 'Copied' : `Copy ${command}`}
      class="grid size-9 shrink-0 place-items-center rounded transition-colors {tone === 'night' ? 'bg-night-raised hover:bg-night-high' : 'bg-night-high hover:bg-[#44434d]'}"
    >
      <Icon name={copied ? 'tick-02' : 'copy-01'} class="size-[18px] {copied ? 'text-running' : ''}" />
    </button>
    <span class="sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
  {/if}
</div>

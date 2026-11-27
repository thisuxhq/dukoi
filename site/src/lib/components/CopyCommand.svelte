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
  <!-- Scrolls sideways on a phone, where the install line is wider than the screen -->
  <code class="min-w-0 overflow-x-auto font-mono whitespace-pre [scrollbar-width:none] {size === 'sm' ? 'text-sm lg:text-[15px]' : size === 'md' ? 'text-[15px] lg:text-[17px]' : 'text-base lg:text-lg'}"
    ><span class="cmd-prompt text-prompt">$</span> {command}</code
  >
  {#if size !== 'sm'}
    <button
      type="button"
      onclick={copy}
      aria-label={copied ? 'Copied' : `Copy ${command}`}
      class="copy-trigger pressable grid size-9 shrink-0 cursor-pointer place-items-center rounded {tone === 'night' ? 'bg-night-raised hover:bg-night-high' : 'bg-night-high hover:bg-[#44434d]'} {copied ? 'shadow-[inset_0_0_0_1px_rgba(24,169,87,0.45)]' : ''}"
    >
      <span class="swap-item grid place-items-center" data-active={!copied}>
        <Icon name="copy-01" class="copy-icon-nudge size-[18px]" />
      </span>
      <span class="swap-item grid place-items-center" data-active={copied}>
        <Icon name="tick-02" class="size-[18px] text-running" />
      </span>
    </button>
    <span class="sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
  {/if}
</div>

<script lang="ts">
import Icon from '../Icon.svelte'

// A command with a copy button, and optionally what it prints underneath.
// Ticks turn green and URLs violet, like the real CLI's colours.
let { command, output }: { command: string; output?: string } = $props()

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const html = $derived(
  output &&
    escapeHtml(output.replace(/^\n+|\s+$/g, ''))
      .replace(/^✓/gm, '<span class="text-tick">✓</span>')
      .replace(/(https?:\/\/\S+)/g, '<span class="text-log-note">$1</span>'),
)

let copied = $state(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  await navigator.clipboard.writeText(command)
  copied = true
  clearTimeout(timer)
  timer = setTimeout(() => (copied = false), 1600)
}
</script>

<div class="flex flex-col rounded bg-night text-white" data-terminal={command}>
  <div class="flex items-center justify-between gap-4 py-3 pr-3 pl-4 lg:pl-5 {output ? 'border-b border-night-raised' : ''}">
    <code class="overflow-x-auto font-mono text-sm leading-[22px] whitespace-pre lg:text-[15px]"><span class="text-prompt">$</span> {command}</code>
    <button
      type="button"
      onclick={copy}
      aria-label={copied ? 'Copied' : `Copy ${command}`}
      class="grid size-8 shrink-0 place-items-center rounded bg-night-raised transition-colors hover:bg-night-high"
    >
      <Icon name={copied ? 'tick-02' : 'copy-01'} class="size-4 {copied ? 'text-running' : ''}" />
    </button>
    <span class="sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
  </div>
  {#if html}
    <pre class="overflow-x-auto px-4 pt-4 pb-[18px] font-mono text-[13px] leading-6 text-night-muted lg:px-5 lg:text-sm">{@html html}</pre>
  {/if}
</div>

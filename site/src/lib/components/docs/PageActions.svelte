<script lang="ts">
import { markdownPath } from '#lib/docs.js'
import { page } from '$app/state'
import Icon from '../Icon.svelte'

// Copy this page as Markdown, or open it in an AI chat that reads its .md twin.
const markdown = $derived(markdownPath(page.url.pathname))

let copied = $state(false)
let open = $state(false)
let menu: HTMLDivElement | undefined = $state()
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  open = false
  // Passing the fetch as a promise keeps Safari's click permission for the clipboard.
  const text = fetch(markdown).then(async (res) => {
    if (!res.ok) throw new Error(`Couldn't load ${markdown} (HTTP ${res.status})`)
    return new Blob([await res.text()], { type: 'text/plain' })
  })
  await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text })])
  copied = true
  clearTimeout(timer)
  timer = setTimeout(() => (copied = false), 1600)
}

const chats = [
  { name: 'ChatGPT', icon: 'chat-gpt', url: 'https://chatgpt.com/?hints=search&q=' },
  { name: 'Claude', icon: 'claude', url: 'https://claude.ai/new?q=' },
  { name: 'Grok', icon: 'grok', url: 'https://grok.com/?q=' },
]

/** The chat link, built on click so it carries this site's real address. */
function openIn(url: string) {
  open = false
  const prompt = `Read ${location.origin}${markdown} so I can ask questions about it.`
  window.open(url + encodeURIComponent(prompt), '_blank', 'noopener')
}

function onWindowClick(event: MouseEvent) {
  if (open && menu && !menu.contains(event.target as Node)) open = false
}
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div bind:this={menu} class="relative flex shrink-0" data-md-skip>
  <button
    type="button"
    onclick={copy}
    class="flex h-9 items-center gap-2 rounded-l border border-line bg-card px-3 text-sm font-medium transition-colors hover:bg-canvas"
  >
    <Icon name={copied ? 'tick-02' : 'copy-01'} class="size-4 {copied ? 'text-running' : 'text-muted'}" />
    {copied ? 'Copied' : 'Copy page'}
  </button>
  <button
    type="button"
    onclick={() => (open = !open)}
    aria-label="More ways to use this page"
    aria-expanded={open}
    class="grid h-9 w-9 place-items-center rounded-r border border-l-0 border-line bg-card transition-colors hover:bg-canvas"
  >
    <Icon name="arrow-down-01" class="size-4 text-muted transition-transform {open ? 'rotate-180' : ''}" />
  </button>
  <span class="sr-only" aria-live="polite">{copied ? 'Page copied as Markdown' : ''}</span>

  {#if open}
    <div class="absolute top-11 z-10 flex w-64 flex-col border border-line bg-card py-1.5 shadow-[0_8px_24px_rgba(22,22,26,0.08)] lg:right-0">
      <button type="button" onclick={copy} class="flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-canvas">
        <Icon name="copy-01" class="size-[18px] text-muted" />Copy page as Markdown
      </button>
      {#each chats as chat (chat.name)}
        <button type="button" onclick={() => openIn(chat.url)} class="flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-canvas">
          <Icon name={chat.icon} class="size-[18px]" />Open in {chat.name}
        </button>
      {/each}
    </div>
  {/if}
</div>

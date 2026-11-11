<script lang="ts">
import { APK } from '#lib/links.js'
import Icon from './Icon.svelte'

// Copies a prompt that lets a coding agent (Claude Code, Codex, Cursor) do the
// computer side of setup. The person still installs the app and taps Approve.
let { class: className = '' }: { class?: string } = $props()

let copied = $state(false)
let timer: ReturnType<typeof setTimeout> | undefined

/** Built on click so the docs link carries this site's real address. */
const prompt = () => `Set up Dukoi so I can host my apps on my old Android phone.

1. Ask me to install the Dukoi app on the phone from
   ${APK}
   and tap through its four setup steps. Wait until I say it's done.
2. Run npx dukoi pair here. When it shows a six-digit code,
   ask me to check it matches the phone and tap Approve.
3. In my app's folder, run npx dukoi deploy. The app must
   listen on process.env.PORT. If deploy fails, the error says why
   and what to change.
4. If I want a public URL, run npx dukoi expose.

Add --json to any command for output you can parse.
Docs: ${location.origin}/llms.txt`

async function copy() {
  await navigator.clipboard.writeText(prompt())
  copied = true
  clearTimeout(timer)
  timer = setTimeout(() => (copied = false), 2000)
}
</script>

<button
  type="button"
  onclick={copy}
  class="flex h-14 shrink-0 items-center justify-center gap-3 rounded bg-violet text-base font-semibold text-white transition-colors hover:bg-[#6a2fe0] lg:h-[60px] lg:w-[264px] lg:text-[17px] {className}"
>
  {copied ? 'Copied' : 'Copy prompt for agent'}
  <Icon name={copied ? 'tick-02' : 'copy-01'} class="size-[18px]" />
</button>
<span class="sr-only" aria-live="polite">{copied ? 'Prompt copied. Paste it to your agent.' : ''}</span>

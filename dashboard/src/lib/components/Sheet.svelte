<script lang="ts">
import type { Snippet } from 'svelte'
import Icon from './Icon.svelte'
import Tile from './Tile.svelte'

// A panel for making something: slides in from the right on a computer, and
// up from the bottom on a phone. A native <dialog>, so focus and Escape just work.
let {
  open = $bindable(false),
  tile,
  title,
  busy = false,
  children,
  footer,
}: {
  open?: boolean
  /** Template or database kind, for the coloured tile */
  tile: string
  title: string
  /** While true, it can't be closed */
  busy?: boolean
  children: Snippet
  footer: Snippet
} = $props()

let dialog = $state<HTMLDialogElement>()

$effect(() => {
  if (open && !dialog?.open) dialog?.showModal()
  if (!open && dialog?.open) dialog?.close()
})
</script>

<dialog
	bind:this={dialog}
	onclose={() => (open = false)}
	oncancel={(e) => busy && e.preventDefault()}
	onclick={(e) => e.target === dialog && !busy && (open = false)}
	class="fixed inset-x-0 top-auto bottom-0 m-0 flex max-h-[92dvh] w-full max-w-none flex-col bg-card text-ink backdrop:bg-ink/30 not-open:hidden md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:max-h-none md:w-[480px]"
>
	<div class="flex justify-center pt-2.5 md:hidden"><span class="h-1 w-9 rounded-sm bg-line"></span></div>
	<div class="flex items-center gap-3.5 px-4 pt-4 md:flex-col md:items-start md:gap-5 md:px-8 md:pt-7">
		<span class="md:hidden"><Tile id={tile} size={48} /></span>
		<span class="hidden md:block"><Tile id={tile} size={56} /></span>
		<h2 class="min-w-0 flex-1 font-display text-[28px] leading-8 font-medium tracking-[-0.03em] md:text-[32px] md:leading-9">{title}</h2>
		<button
			type="button"
			disabled={busy}
			onclick={() => (open = false)}
			aria-label="Close"
			class="grid size-10 shrink-0 place-items-center disabled:opacity-40 md:absolute md:top-7 md:right-7"
		>
			<Icon name="cancel-01" size={20} />
		</button>
	</div>
	<div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pt-3 pb-6 md:gap-8 md:px-8 md:pt-2">
		{@render children()}
	</div>
	<div class="flex flex-col gap-3.5 border-t border-divider px-4 pt-5 pb-7 md:gap-4 md:px-8 md:pt-6 md:pb-8">
		{@render footer()}
	</div>
</dialog>

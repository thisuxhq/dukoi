<script lang="ts">
import { tick } from 'svelte'
import type { LogLine } from '#lib/log-line.js'
import type { Problem } from '#lib/problem.js'

// The dark log panel on an app's and a database's page. Keeps the newest line
// in view, unless you've scrolled up to read.
let {
  lines,
  connected,
  problem,
  class: className = '',
}: { lines: LogLine[]; connected: boolean; problem: Problem | null; class?: string } = $props()

let panel = $state<HTMLElement>()
let pinned = $state(true)
$effect(() => {
  void lines.length
  if (pinned) tick().then(() => panel?.scrollTo({ top: panel.scrollHeight }))
})
</script>

<section class="flex min-w-0 flex-col gap-4 bg-night px-4 py-4 md:px-6 md:py-5 {className}">
	<h2 class="flex items-center gap-2 font-display text-xl font-medium text-white">
		Logs
		<span class="size-[7px] rounded-full {connected && !problem ? 'bg-log-live' : 'bg-log-time'}"></span>
	</h2>
	<div
		bind:this={panel}
		onscroll={() => panel && (pinned = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 40)}
		class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto font-mono text-xs leading-[18px] md:text-[13px] md:leading-5"
	>
		{#each lines as line, i (i)}
			<div class="flex gap-2 md:gap-3">
				<span class="w-16 shrink-0 text-log-time md:w-[72px]">{line.time}</span>
				<span class="w-6 shrink-0 {line.stream === 'err' ? 'text-log-error' : 'text-log-note'}">
					{line.stream === 'agent' ? '●' : line.stream === 'err' ? 'err' : ''}
				</span>
				<span class="min-w-0 flex-1 break-words whitespace-pre-wrap {line.stream === 'agent' ? 'text-log-note' : line.stream === 'err' ? 'text-log-error' : 'text-log-text'}">{line.text}</span>
			</div>
		{/each}
		{#if problem}
			<p class="text-log-error">{problem.message} Trying again.</p>
		{/if}
	</div>
</section>

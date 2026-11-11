<script lang="ts">
import CommandBox from '#lib/components/CommandBox.svelte'
import Icon from '#lib/components/Icon.svelte'
import ProblemNote from '#lib/components/ProblemNote.svelte'
import StateLabel from '#lib/components/StateLabel.svelte'
import Stats from '#lib/components/Stats.svelte'
import { bare, cpu, duration, memory, since, storageFree } from '#lib/format.js'
import { liveOverview } from '#lib/phone.remote.js'

const overview = liveOverview()
const data = $derived(overview.current)
const live = (state: string) => state === 'running'
</script>

<div class="flex flex-col gap-7">
	<div class="flex items-end justify-between">
		<h1 class="font-display text-[44px] leading-[48px] font-medium tracking-[-0.03em]">Apps</h1>
		<CommandBox command="npx droidhost deploy" />
	</div>

	{#if data?.problem}<ProblemNote problem={data.problem} />{/if}

	{#if data?.status}
		<Stats
			big
			cells={[
				[cpu(data.status), 'CPU'],
				[memory(data.status), 'Memory'],
				[storageFree(data.status), 'Storage free'],
				[duration(data.status.phoneUptimeSeconds), 'Phone up']
			]}
		/>
	{/if}

	{#if data && data.apps.length === 0 && !data.problem}
		<div class="flex flex-col items-center gap-2 border border-dashed border-line px-6 py-16 text-center">
			<p class="font-display text-[22px] font-medium">No apps yet</p>
			<p class="text-sm text-muted">Run the command above in your app’s folder.</p>
		</div>
	{:else if data}
		<div class="flex flex-col gap-px">
			<div class="flex items-center gap-6 px-6 pb-2.5 text-[13px] text-muted">
				<span class="flex-1">App</span>
				<span class="w-[140px] shrink-0">Status</span>
				<span class="w-[340px] shrink-0">Public link</span>
				<span class="w-20 shrink-0 text-right">CPU</span>
				<span class="w-20 shrink-0 text-right">Memory</span>
				<span class="w-20 shrink-0 text-right">Uptime</span>
				<span class="w-[18px] shrink-0"></span>
			</div>
			{#each data.apps as app (app.name)}
				<a href="/apps/{app.name}" class="flex items-center gap-6 bg-card px-6 py-5 transition-colors hover:bg-white/60">
					<span class="flex-1 truncate font-display text-xl font-medium">{app.name}</span>
					<span class="w-[140px] shrink-0"><StateLabel state={app.state} /></span>
					<span class="w-[340px] shrink-0 truncate {app.publicUrl ? 'font-mono text-[13px] text-violet' : 'text-sm text-muted'}">
						{app.publicUrl ? bare(app.publicUrl) : 'Wi-Fi only'}
					</span>
					<span class="w-20 shrink-0 text-right text-sm tabular-nums {live(app.state) ? '' : 'text-muted'}">
						{live(app.state) && app.cpuPercent !== null ? `${Math.round(app.cpuPercent)}%` : '–'}
					</span>
					<span class="w-20 shrink-0 text-right text-sm tabular-nums {live(app.state) ? '' : 'text-muted'}">
						{live(app.state) && app.memoryMb !== null ? `${Math.round(app.memoryMb)} MB` : '–'}
					</span>
					<span class="w-20 shrink-0 text-right text-sm tabular-nums {live(app.state) ? '' : 'text-muted'}">
						{live(app.state) ? since(app.startedAt) : '–'}
					</span>
					<span class="text-muted"><Icon name="arrow-right" /></span>
				</a>
			{/each}
		</div>
	{/if}
</div>

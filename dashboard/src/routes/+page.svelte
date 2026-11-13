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
/** The URL without its password, for the list. The database's page copies the real one. */
const masked = (url: string) => url.replace(/:([^:@/]+)@/, ':•••@')
</script>

<div class="flex flex-col gap-5 md:gap-7">
	<div class="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
		<h1 class="font-display text-[36px] leading-10 font-medium tracking-[-0.03em] md:text-[44px] md:leading-[48px]">Apps</h1>
		<CommandBox command="dukoi deploy" />
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
			<p class="text-sm text-muted">Run the command above in your app’s folder, or <a href="/templates" class="font-semibold text-violet">start from a template</a>.</p>
		</div>
	{:else if data}
		<div class="flex flex-col gap-px">
			<div class="hidden items-center gap-6 px-6 pb-2.5 text-[13px] text-muted lg:flex">
				<span class="flex-1">App</span>
				<span class="w-[140px] shrink-0">Status</span>
				<span class="w-[260px] shrink-0 xl:w-[340px]">Public link</span>
				<span class="w-20 shrink-0 text-right">CPU</span>
				<span class="w-20 shrink-0 text-right">Memory</span>
				<span class="w-20 shrink-0 text-right">Uptime</span>
				<span class="w-[18px] shrink-0"></span>
			</div>
			{#each data.apps as app (app.name)}
				<a href="/apps/{app.name}" class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 bg-card px-4 py-4 transition-colors hover:bg-white/60 lg:flex lg:gap-6 lg:px-6 lg:py-5">
					<span class="flex-1 truncate font-display text-xl font-medium">{app.name}</span>
					<span class="shrink-0 lg:w-[140px]"><StateLabel state={app.state} /></span>
					<span class="col-span-2 truncate lg:w-[260px] xl:w-[340px] lg:shrink-0 {app.publicUrl ? 'font-mono text-[13px] text-violet' : 'text-sm text-muted'}">
						{app.publicUrl ? bare(app.publicUrl) : 'Wi-Fi only'}
					</span>
					<span class="hidden w-20 shrink-0 text-right text-sm tabular-nums lg:block {live(app.state) ? '' : 'text-muted'}">
						{live(app.state) && app.cpuPercent !== null ? `${Math.round(app.cpuPercent)}%` : '–'}
					</span>
					<span class="hidden w-20 shrink-0 text-right text-sm tabular-nums lg:block {live(app.state) ? '' : 'text-muted'}">
						{live(app.state) && app.memoryMb !== null ? `${Math.round(app.memoryMb)} MB` : '–'}
					</span>
					<span class="hidden w-20 shrink-0 text-right text-sm tabular-nums lg:block {live(app.state) ? '' : 'text-muted'}">
						{live(app.state) ? since(app.startedAt) : '–'}
					</span>
					<span class="hidden text-muted lg:block"><Icon name="arrow-right" /></span>
				</a>
			{/each}
		</div>
	{/if}
	{#if data && data.databases.length > 0}
		<div class="flex flex-col gap-px pt-2 lg:pt-1">
			<h2 class="pb-3 font-display text-[22px] leading-7 font-medium lg:hidden">Databases</h2>
			<div class="hidden items-center gap-6 px-6 pb-2.5 text-[13px] text-muted lg:flex">
				<span class="flex-1">Database</span>
				<span class="w-[140px] shrink-0">Status</span>
				<span class="w-[260px] shrink-0 xl:w-[340px]">Connection</span>
				<span class="w-20 shrink-0 text-right">CPU</span>
				<span class="w-20 shrink-0 text-right">Memory</span>
				<span class="w-20 shrink-0 text-right">Uptime</span>
				<span class="w-[18px] shrink-0"></span>
			</div>
			{#each data.databases as db (db.name)}
				<a href="/databases/{db.name}" class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 bg-card px-4 py-4 transition-colors hover:bg-white/60 lg:flex lg:gap-6 lg:px-6 lg:py-5">
					<span class="flex-1 truncate font-display text-xl font-medium">{db.name}</span>
					<span class="shrink-0 lg:w-[140px]"><StateLabel state={db.state} /></span>
					<span class="col-span-2 truncate font-mono text-[13px] lg:w-[260px] lg:shrink-0 xl:w-[340px]">{masked(db.url)}</span>
					<span class="hidden w-20 shrink-0 text-right text-sm tabular-nums lg:block {live(db.state) ? '' : 'text-muted'}">
						{live(db.state) && db.cpuPercent !== null ? `${Math.round(db.cpuPercent)}%` : '–'}
					</span>
					<span class="hidden w-20 shrink-0 text-right text-sm tabular-nums lg:block {live(db.state) ? '' : 'text-muted'}">
						{live(db.state) && db.memoryMb !== null ? `${Math.round(db.memoryMb)} MB` : '–'}
					</span>
					<span class="hidden w-20 shrink-0 text-right text-sm tabular-nums lg:block {live(db.state) ? '' : 'text-muted'}">
						{live(db.state) ? since(db.startedAt) : '–'}
					</span>
					<span class="hidden text-muted lg:block"><Icon name="arrow-right" /></span>
				</a>
			{/each}
		</div>
	{/if}
</div>

<script lang="ts">
import { tick } from 'svelte'
import CopyButton from '#lib/components/CopyButton.svelte'
import Icon from '#lib/components/Icon.svelte'
import ProblemNote from '#lib/components/ProblemNote.svelte'
import StateLabel from '#lib/components/StateLabel.svelte'
import Stats from '#lib/components/Stats.svelte'
import { bare, since, when } from '#lib/format.js'
import { control, liveApp, liveLogs, rollback } from '#lib/phone.remote.js'
import { toast } from '#lib/toast.svelte.js'
import type { PageProps } from './$types'

let { params }: PageProps = $props()
const detail = $derived(liveApp(params.name))
const logs = $derived(liveLogs(params.name))
const app = $derived(detail.current?.app ?? null)
let busy = $state<string | null>(null)

// Every action confirms itself, like the phone app: a note while it runs, then what happened.
async function act(label: string, done: string, run: () => Promise<void>) {
  if (busy) return
  busy = label
  toast.show(`${label} ${params.name}`)
  try {
    await run()
    toast.show(done)
  } catch (err) {
    const body = (err as { body?: { message?: string } }).body
    toast.show(body?.message ?? 'Something went wrong.', true)
  } finally {
    busy = null
  }
}

const restart = () =>
  act('Restarting', `Restarted ${params.name}`, () =>
    control({ name: params.name, action: 'restart' }),
  )
const stopOrStart = () =>
  app?.state === 'stopped'
    ? act('Starting', `Started ${params.name}`, () =>
        control({ name: params.name, action: 'start' }),
      )
    : act('Stopping', `Stopped ${params.name}`, () =>
        control({ name: params.name, action: 'stop' }),
      )
const rollTo = (id: string) =>
  act('Rolling back', `${params.name} is on release ${id}`, () =>
    rollback({ name: params.name, to: id }),
  )

// Keep the newest line in view, unless you've scrolled up to read.
let panel = $state<HTMLElement>()
let pinned = $state(true)
$effect(() => {
  void logs.current?.lines.length
  if (pinned) tick().then(() => panel?.scrollTo({ top: panel.scrollHeight }))
})

const live = $derived(app?.state === 'running')
// Newest first.
const releases = $derived([...(detail.current?.releases ?? [])].reverse())
</script>

<div class="flex flex-col gap-6">
	<a href="/" class="flex w-fit items-center gap-1 text-sm font-semibold text-violet">
		<Icon name="arrow-left" size={20} />Apps
	</a>

	<div class="flex items-end justify-between">
		<div class="flex flex-col gap-2.5">
			<h1 class="font-display text-[44px] leading-[48px] font-medium tracking-[-0.03em]">{params.name}</h1>
			{#if app}<StateLabel state={app.state} big />{/if}
		</div>
		{#if app}
			<div class="flex gap-3">
				<button type="button" disabled={busy !== null} onclick={restart} class="h-11 w-[120px] rounded border border-line bg-card text-sm font-semibold disabled:opacity-50">
					Restart
				</button>
				<button type="button" disabled={busy !== null} onclick={stopOrStart} class="h-11 w-[120px] rounded border border-line bg-card text-sm font-semibold disabled:opacity-50">
					{app.state === 'stopped' ? 'Start' : 'Stop'}
				</button>
			</div>
		{/if}
	</div>

	{#if detail.current?.problem}<ProblemNote problem={detail.current.problem} />{/if}

	<div class="flex h-[calc(100vh-300px)] min-h-[440px] gap-6">
		<div class="flex w-[440px] shrink-0 flex-col gap-3 overflow-y-auto">
			{#if app}
				<div class="flex flex-col gap-px">
					<div class="flex items-center gap-2 bg-card py-3.5 pr-2 pl-4">
						<div class="flex min-w-0 flex-1 flex-col gap-0.5">
							<span class="text-xs text-muted">Public</span>
							{#if app.publicUrl}
								<a href={app.publicUrl} target="_blank" rel="noreferrer" class="truncate font-mono text-[13px] text-violet">{bare(app.publicUrl)}</a>
							{:else}
								<span class="text-[13px] text-muted">Off. Run <code class="font-mono">droidhost expose {app.name}</code></span>
							{/if}
						</div>
						{#if app.publicUrl}<CopyButton text={app.publicUrl} label="URL" class="text-muted" />{/if}
					</div>
					<div class="flex items-center gap-2 bg-card py-3.5 pr-2 pl-4">
						<div class="flex min-w-0 flex-1 flex-col gap-0.5">
							<span class="text-xs text-muted">Wi-Fi</span>
							<a href={app.localUrl} target="_blank" rel="noreferrer" class="truncate font-mono text-[13px]">{bare(app.localUrl)}</a>
						</div>
						<CopyButton text={app.localUrl} label="URL" class="text-muted" />
					</div>
				</div>

				<Stats
					cells={[
						[live && app.cpuPercent !== null ? `${Math.round(app.cpuPercent)}%` : '–', 'CPU'],
						[live && app.memoryMb !== null ? `${Math.round(app.memoryMb)} MB` : '–', 'Memory'],
						[live ? since(app.startedAt) : '–', 'Uptime']
					]}
				/>

				<h2 class="pt-5 font-display text-[22px] font-medium">Releases</h2>
				<div class="flex flex-col gap-px">
					{#each releases as release (release.id)}
						<div class="flex items-center gap-4 bg-card px-4 py-[13px]">
							<span class="w-12 shrink-0 font-mono text-[13px]">{release.id}</span>
							<span class="flex-1 text-sm text-muted">{when(release.createdAt)}</span>
							{#if release.live || release.id === app.release}
								<span class="flex w-20 items-center justify-end gap-1.5 text-[13px] font-medium">
									<span class="size-[7px] rounded-full {release.live ? 'bg-running' : 'bg-muted'}"></span>
									{release.live ? 'Live' : 'Current'}
								</span>
							{:else}
								<button type="button" disabled={busy !== null} onclick={() => rollTo(release.id)} class="w-20 text-right text-sm font-semibold text-violet disabled:opacity-50">
									Roll back
								</button>
							{/if}
						</div>
					{:else}
						<p class="text-sm text-muted">No releases yet.</p>
					{/each}
				</div>
			{/if}
		</div>

		<section class="flex min-w-0 flex-1 flex-col gap-4 bg-night px-6 py-5">
			<h2 class="flex items-center gap-2 font-display text-xl font-medium text-white">
				Logs
				<span class="size-[7px] rounded-full {logs.connected && !logs.current?.problem ? 'bg-log-live' : 'bg-log-time'}"></span>
			</h2>
			<div
				bind:this={panel}
				onscroll={() => panel && (pinned = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 40)}
				class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto font-mono text-[13px] leading-5"
			>
				{#each logs.current?.lines ?? [] as line, i (i)}
					<div class="flex gap-3">
						<span class="w-[72px] shrink-0 text-log-time">{line.time}</span>
						<span class="w-6 shrink-0 {line.stream === 'err' ? 'text-log-error' : 'text-log-note'}">
							{line.stream === 'agent' ? '●' : line.stream === 'err' ? 'err' : ''}
						</span>
						<span class="min-w-0 flex-1 break-words whitespace-pre-wrap {line.stream === 'agent' ? 'text-log-note' : line.stream === 'err' ? 'text-log-error' : 'text-log-text'}">{line.text}</span>
					</div>
				{/each}
				{#if logs.current?.problem}
					<p class="text-log-error">{logs.current.problem.message} Trying again.</p>
				{/if}
			</div>
		</section>
	</div>
</div>

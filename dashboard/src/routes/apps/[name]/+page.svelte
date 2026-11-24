<script lang="ts">
import CopyButton from '#lib/components/CopyButton.svelte'
import Icon from '#lib/components/Icon.svelte'
import LogPanel from '#lib/components/LogPanel.svelte'
import ProblemNote from '#lib/components/ProblemNote.svelte'
import RequestPanel from '#lib/components/RequestPanel.svelte'
import StateLabel from '#lib/components/StateLabel.svelte'
import Stats from '#lib/components/Stats.svelte'
import { bare, since, when } from '#lib/format.js'
import {
  control,
  getAppAuth,
  liveApp,
  liveLogs,
  liveRequests,
  rollback,
  setAppAuth,
} from '#lib/phone.remote.js'
import { toast } from '#lib/toast.svelte.js'
import type { PageProps } from './$types'

let { params }: PageProps = $props()
const detail = $derived(liveApp(params.name))
const logs = $derived(liveLogs(params.name))
const requests = $derived(liveRequests(params.name))
const app = $derived(detail.current?.app ?? null)
let busy = $state<string | null>(null)
let tab = $state<'logs' | 'requests'>('logs')

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

const toggleAuth = () =>
  app?.auth
    ? act(
        'Turning off private access for',
        `Private access is off for ${params.name}`,
        async () => {
          await setAppAuth({ name: params.name, action: 'disable' })
        },
      )
    : act('Turning on private access for', `Private access is on for ${params.name}`, async () => {
        await setAppAuth({ name: params.name, action: 'enable' })
      })

const rotateAuth = () =>
  act('Rotating access token for', `New access token ready for ${params.name}`, async () => {
    await setAppAuth({ name: params.name, action: 'rotate' })
  })

async function copyAuth(kind: 'link' | 'token') {
  try {
    const res = await getAppAuth(params.name)
    if (!res.token) return toast.show('Private access is off.', true)
    const base = app?.publicUrl ?? app?.localUrl ?? ''
    const text =
      kind === 'link' ? `${base}/_dukoi/auth?token=${encodeURIComponent(res.token)}` : res.token
    await navigator.clipboard.writeText(text)
    toast.show(kind === 'link' ? 'Copied sign-in link' : 'Copied access token')
  } catch (err) {
    const body = (err as { body?: { message?: string } }).body
    toast.show(body?.message ?? 'Could not copy access token.', true)
  }
}

const live = $derived(app?.state === 'running')
// Newest first.
const releases = $derived([...(detail.current?.releases ?? [])].reverse())
</script>

<div class="flex flex-col gap-5 md:gap-6">
	<a href="/" class="flex w-fit items-center gap-1 text-sm font-semibold text-violet">
		<Icon name="arrow-left" size={20} />Apps
	</a>

	<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="flex flex-col gap-2.5">
			<h1 class="font-display text-[36px] leading-10 font-medium tracking-[-0.03em] break-all md:text-[44px] md:leading-[48px]">{params.name}</h1>
			{#if app}<StateLabel state={app.state} big />{/if}
		</div>
		{#if app}
			<div class="flex gap-3 *:flex-1 sm:*:flex-none">
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

	<div class="flex flex-col gap-6 lg:h-[calc(100vh-300px)] lg:min-h-[440px] lg:flex-row">
		<div class="flex shrink-0 flex-col gap-3 lg:w-[400px] lg:overflow-y-auto xl:w-[440px]">
			{#if app}
				<div class="flex flex-col gap-px">
					<div class="flex items-center gap-2 bg-card py-3.5 pr-2 pl-4">
						<div class="flex min-w-0 flex-1 flex-col gap-0.5">
							<span class="text-xs text-muted">Public</span>
							{#if app.publicUrl}
								<a href={app.publicUrl} target="_blank" rel="noreferrer" class="truncate font-mono text-[13px] text-violet">{bare(app.publicUrl)}</a>
							{:else}
								<span class="text-[13px] text-muted">Off. Run <code class="font-mono">dukoi expose {app.name}</code></span>
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
					<div class="flex items-center justify-between gap-2 bg-card px-4 py-3.5">
						<div class="flex min-w-0 flex-col gap-0.5">
							<span class="text-xs text-muted">Private access</span>
							<span class="text-[13px] font-medium">{app.auth ? 'On' : 'Off'}</span>
						</div>
						<div class="flex flex-wrap items-center justify-end gap-3 text-xs font-semibold">
							{#if app.auth}
								<button type="button" onclick={() => copyAuth('link')} class="text-violet">Copy link</button>
								<button type="button" onclick={() => copyAuth('token')} class="text-muted hover:text-ink">Token</button>
								<button type="button" disabled={busy !== null} onclick={rotateAuth} class="text-muted hover:text-ink disabled:opacity-50">Rotate</button>
								<button type="button" disabled={busy !== null} onclick={toggleAuth} class="text-muted hover:text-ink disabled:opacity-50">Turn off</button>
							{:else}
								<button type="button" disabled={busy !== null} onclick={toggleAuth} class="text-violet disabled:opacity-50">Turn on</button>
							{/if}
						</div>
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

		<div class="flex h-[480px] min-w-0 flex-col bg-night lg:h-auto lg:flex-1">
			<div class="flex items-center gap-6 border-b border-white/10 px-4 py-3.5 md:px-6">
				<button
					type="button"
					onclick={() => (tab = 'logs')}
					class="flex items-center gap-2 font-display text-lg font-medium {tab === 'logs'
						? 'text-white'
						: 'text-log-time hover:text-log-text'}"
				>
					Logs
					<span class="size-[7px] rounded-full {logs.connected && !logs.current?.problem ? 'bg-log-live' : 'bg-log-time'}"></span>
				</button>
				<button
					type="button"
					onclick={() => (tab = 'requests')}
					class="flex items-center gap-2 font-display text-lg font-medium {tab === 'requests'
						? 'text-white'
						: 'text-log-time hover:text-log-text'}"
				>
					Requests
					{#if (requests.current?.requests.length ?? 0) > 0}
						<span class="font-mono text-xs text-log-note">{requests.current?.requests.length}</span>
					{/if}
					<span class="size-[7px] rounded-full {requests.connected && !requests.current?.problem ? 'bg-log-live' : 'bg-log-time'}"></span>
				</button>
			</div>

			{#if tab === 'logs'}
				<LogPanel
					lines={logs.current?.lines ?? []}
					connected={logs.connected}
					problem={logs.current?.problem ?? null}
					showTitle={false}
					class="min-h-0 flex-1"
				/>
			{:else}
				<RequestPanel
					appName={params.name}
					requests={requests.current?.requests ?? []}
					problem={requests.current?.problem ?? null}
					class="px-4 py-4 md:px-6 md:py-5"
				/>
			{/if}
		</div>
	</div>
</div>

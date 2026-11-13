<script lang="ts">
import Check from '#lib/components/Check.svelte'
import Confirm from '#lib/components/Confirm.svelte'
import CopyButton from '#lib/components/CopyButton.svelte'
import Icon from '#lib/components/Icon.svelte'
import LogPanel from '#lib/components/LogPanel.svelte'
import ProblemNote from '#lib/components/ProblemNote.svelte'
import StateLabel from '#lib/components/StateLabel.svelte'
import Stats from '#lib/components/Stats.svelte'
import {
  changeDatabase,
  controlDatabase,
  liveDatabase,
  liveDatabaseLogs,
  removeDatabase,
} from '#lib/databases.remote.js'
import { since } from '#lib/format.js'
import { toast } from '#lib/toast.svelte.js'
import { goto } from '$app/navigation'
import type { PageProps } from './$types'

let { params }: PageProps = $props()
const detail = $derived(liveDatabase(params.name))
const logs = $derived(liveDatabaseLogs(params.name))
const db = $derived(detail.current?.db ?? null)
const live = $derived(db?.state === 'running')
const unconnected = $derived(
  (detail.current?.apps ?? []).filter((a) => !(db?.apps ?? []).includes(a)),
)

let busy = $state<string | null>(null)
let picking = $state(false)
let removing = $state(false)

/** "redis://:abc…@127.0.0.1:6380" → "redis://:••••••••@127.0.0.1:6380". Copy gives the real one. */
const masked = (url: string) => url.replace(/:([^:@/]+)@/, ':••••••••@')

// Every action confirms itself, like the app page: a note while it runs, then what happened.
async function act(label: string, done: string, run: () => Promise<unknown>) {
  if (busy) return
  busy = label
  toast.show(label)
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

const name = $derived(params.name)
const restart = () =>
  act(`Restarting ${name}`, `Restarted ${name}`, () => controlDatabase({ name, action: 'restart' }))
const stopOrStart = () =>
  db?.state === 'stopped'
    ? act(`Starting ${name}`, `Started ${name}`, () => controlDatabase({ name, action: 'start' }))
    : act(`Stopping ${name}`, `Stopped ${name}`, () => controlDatabase({ name, action: 'stop' }))
const setWifi = (wifi: boolean) =>
  act(
    wifi ? 'Opening it to your Wi-Fi' : 'Closing it to your Wi-Fi',
    wifi ? `${name} is reachable on your Wi-Fi` : `${name} is for this phone's apps only`,
    () => changeDatabase({ name, wifi }),
  )
const newPassword = () =>
  act('Making a new password', 'New password made. Connected apps have it.', () =>
    changeDatabase({ name, newPassword: true }),
  )
const connectApp = (app: string) => {
  picking = false
  return act(`Giving ${db?.envName} to ${app}`, `${app} has ${db?.envName}`, () =>
    changeDatabase({ name, connect: [app] }),
  )
}
const disconnectApp = (app: string) =>
  act(`Taking ${db?.envName} from ${app}`, `${app} no longer has ${db?.envName}`, () =>
    changeDatabase({ name, disconnect: [app] }),
  )

async function doRemove() {
  try {
    await removeDatabase(name)
    toast.show(`Removed ${name}`)
    await goto('/')
  } catch (err) {
    const body = (err as { body?: { message?: string } }).body
    toast.show(body?.message ?? 'Something went wrong.', true)
    throw err
  }
}
</script>

<div class="flex flex-col gap-5 md:gap-6">
	<a href="/" class="flex w-fit items-center gap-1 text-sm font-semibold text-violet">
		<Icon name="arrow-left" size={20} />Apps
	</a>

	<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="flex flex-col gap-2.5">
			<h1 class="font-display text-[36px] leading-10 font-medium tracking-[-0.03em] break-all md:text-[44px] md:leading-[48px]">{params.name}</h1>
			{#if db}<StateLabel state={db.state} big />{/if}
		</div>
		{#if db}
			<div class="flex gap-3 *:flex-1 sm:*:flex-none">
				<button type="button" disabled={busy !== null} onclick={restart} class="h-11 w-[120px] rounded border border-line bg-card text-sm font-semibold disabled:opacity-50">
					Restart
				</button>
				<button type="button" disabled={busy !== null} onclick={stopOrStart} class="h-11 w-[120px] rounded border border-line bg-card text-sm font-semibold disabled:opacity-50">
					{db.state === 'stopped' ? 'Start' : 'Stop'}
				</button>
			</div>
		{/if}
	</div>

	{#if detail.current?.problem}<ProblemNote problem={detail.current.problem} />{/if}

	<div class="flex flex-col gap-6 lg:h-[calc(100vh-300px)] lg:min-h-[440px] lg:flex-row">
		<div class="flex shrink-0 flex-col gap-3 lg:w-[400px] lg:overflow-y-auto xl:w-[440px]">
			{#if db}
				<div class="flex flex-col gap-px">
					<div class="flex items-center gap-2 bg-card py-3.5 pr-2 pl-4">
						<div class="flex min-w-0 flex-1 flex-col gap-0.5">
							<span class="text-xs text-muted">Apps on this phone</span>
							<span class="truncate font-mono text-[13px]">{masked(db.url)}</span>
						</div>
						<CopyButton text={db.url} label="URL" class="text-muted" />
					</div>
					{#if db.wifiUrl}
						<div class="flex items-center gap-2 bg-card py-3.5 pr-2 pl-4">
							<div class="flex min-w-0 flex-1 flex-col gap-0.5">
								<span class="text-xs text-muted">Wi-Fi</span>
								<span class="truncate font-mono text-[13px]">{masked(db.wifiUrl)}</span>
							</div>
							<CopyButton text={db.wifiUrl} label="Wi-Fi URL" class="text-muted" />
						</div>
					{/if}
					<div class="flex items-center gap-3.5 bg-card py-3.5 pr-4 pl-4">
						<button
							type="button"
							role="checkbox"
							aria-checked={db.wifiUrl !== null}
							disabled={busy !== null}
							onclick={() => setWifi(db?.wifiUrl === null)}
							class="flex min-w-0 flex-1 items-center gap-3.5 text-left disabled:opacity-60"
						>
							<Check checked={db.wifiUrl !== null} />
							<span class="text-sm font-medium">Also reachable on Wi-Fi</span>
						</button>
						<button type="button" disabled={busy !== null} onclick={newPassword} class="shrink-0 text-sm font-semibold text-violet disabled:opacity-50">
							New password
						</button>
					</div>
				</div>

				<Stats
					cells={[
						[live && db.cpuPercent !== null ? `${Math.round(db.cpuPercent)}%` : '–', 'CPU'],
						[live && db.memoryMb !== null ? `${Math.round(db.memoryMb)} MB` : '–', 'Memory'],
						[live ? since(db.startedAt) : '–', 'Uptime']
					]}
				/>

				<div class="flex items-baseline justify-between pt-5">
					<h2 class="font-display text-[22px] font-medium">Used by</h2>
					{#if unconnected.length > 0}
						<button type="button" onclick={() => (picking = !picking)} class="text-sm font-semibold text-violet">
							{picking ? 'Done' : 'Connect an app'}
						</button>
					{/if}
				</div>
				<div class="flex flex-col gap-px">
					{#each db.apps as app (app)}
						<div class="flex items-center gap-4 bg-card px-4 py-[13px]">
							<a href="/apps/{app}" class="min-w-0 flex-1 truncate font-display text-[17px] font-medium">{app}</a>
							<button type="button" disabled={busy !== null} onclick={() => disconnectApp(app)} class="shrink-0 text-sm font-semibold text-muted disabled:opacity-50">
								Disconnect
							</button>
						</div>
					{:else}
						{#if !picking}
							<p class="text-sm text-muted">
								No apps have <span class="font-mono">{db.envName}</span> yet.
							</p>
						{/if}
					{/each}
					{#if picking}
						{#each unconnected as app (app)}
							<div class="flex items-center gap-4 bg-card/60 px-4 py-[13px]">
								<span class="min-w-0 flex-1 truncate font-display text-[17px] font-medium text-muted">{app}</span>
								<button type="button" disabled={busy !== null} onclick={() => connectApp(app)} class="shrink-0 text-sm font-semibold text-violet disabled:opacity-50">
									Connect
								</button>
							</div>
						{/each}
					{/if}
				</div>
				<p class="text-[13px] text-muted">
					Connected apps get <span class="font-mono">{db.envName}</span> and restart once to pick it up.
				</p>

				<button type="button" onclick={() => (removing = true)} class="mt-4 w-fit text-sm font-semibold text-crashed">
					Delete {db.name}
				</button>
			{/if}
		</div>

		<LogPanel
			lines={logs.current?.lines ?? []}
			connected={logs.connected}
			problem={logs.current?.problem ?? null}
			class="h-[480px] lg:h-auto lg:flex-1"
		/>
	</div>
</div>

<Confirm
	bind:open={removing}
	title="Delete {params.name}?"
	body="Its data is deleted from the phone and can't be brought back. Connected apps lose {db?.envName ?? 'the URL'}."
	action="Delete"
	busyLabel="Deleting…"
	onconfirm={doRemove}
/>

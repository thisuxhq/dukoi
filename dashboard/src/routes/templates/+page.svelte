<script lang="ts">
import type { DatabaseKind, DatabaseKindStatus, TemplateInfo } from '@dukoi/shared'
import Check from '#lib/components/Check.svelte'
import CommandBox from '#lib/components/CommandBox.svelte'
import Icon from '#lib/components/Icon.svelte'
import ProblemNote from '#lib/components/ProblemNote.svelte'
import Sheet from '#lib/components/Sheet.svelte'
import Tile from '#lib/components/Tile.svelte'
import { createDatabase, deployTemplate, getCatalog } from '#lib/databases.remote.js'
import { liveOverview } from '#lib/phone.remote.js'
import { toast } from '#lib/toast.svelte.js'
import { goto } from '$app/navigation'

const catalog = getCatalog()
const overview = liveOverview()
const data = $derived(catalog.current)
const phoneName = $derived(overview.current?.phone.name ?? 'the phone')

const message = (err: unknown) =>
  (err as { body?: { message?: string; hint?: string } }).body?.message ?? 'Something went wrong.'

// ── New database ─────────────────────────────────────────────────────────
let kind = $state<DatabaseKindStatus | null>(null)
let dbOpen = $state(false)
let dbName = $state('')
let dbApps = $state<string[]>([])
let dbWifi = $state(false)
let dbBusy = $state(false)
let dbError = $state<string | null>(null)

const takenNames = $derived(new Set(overview.current?.databases.map((d) => d.name) ?? []))

function suggestName(id: DatabaseKind): string {
  if (!takenNames.has(id)) return id
  let n = 2
  while (takenNames.has(`${id}-${n}`)) n++
  return `${id}-${n}`
}

function openDatabase(k: DatabaseKindStatus) {
  kind = k
  dbName = suggestName(k.id)
  dbApps = []
  dbWifi = false
  dbError = null
  dbOpen = true
}

const toggle = (list: string[], item: string) =>
  list.includes(item) ? list.filter((i) => i !== item) : [...list, item]

async function create() {
  if (!kind || dbBusy) return
  dbBusy = true
  dbError = null
  try {
    const db = await createDatabase({
      kind: kind.id,
      name: dbName.trim() || undefined,
      apps: dbApps,
      wifi: dbWifi,
    })
    if (!db) return
    dbOpen = false
    toast.show(`${db.name} is running`)
    await goto(`/databases/${db.name}`)
  } catch (err) {
    dbError = message(err)
  } finally {
    dbBusy = false
  }
}

// ── Deploy a template ────────────────────────────────────────────────────
let template = $state<TemplateInfo | null>(null)
let tplOpen = $state(false)
let tplSecret = $state('')
let tplBusy = $state(false)
let tplError = $state<string | null>(null)
const exists = $derived(
  template ? (overview.current?.apps.some((a) => a.name === template?.id) ?? false) : false,
)

function openTemplate(t: TemplateInfo) {
  template = t
  tplSecret = ''
  tplError = null
  tplOpen = true
}

async function deploy() {
  if (!template || tplBusy) return
  tplBusy = true
  tplError = null
  try {
    const env = template.secret ? { [template.secret]: tplSecret.trim() } : undefined
    const result = await deployTemplate({ id: template.id, env })
    if (!result) return
    tplOpen = false
    toast.show(`${template.name} is live`)
    await goto(`/apps/${result.app.name}`)
  } catch (err) {
    tplError = message(err)
  } finally {
    tplBusy = false
  }
}
</script>

<div class="flex flex-col gap-5 md:gap-7">
	<div class="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
		<h1 class="font-display text-[36px] leading-10 font-medium tracking-[-0.03em] md:text-[44px] md:leading-[48px]">Templates</h1>
		<CommandBox command="dukoi init" />
	</div>

	{#if data?.problem}<ProblemNote problem={data.problem} />{/if}

	{#if data && data.kinds.length > 0}
		<section class="flex flex-col gap-3 pt-2 md:gap-3.5 md:pt-0">
			<h2 class="font-display text-[22px] leading-7 font-medium">Databases</h2>
			<div class="grid gap-px bg-divider md:grid-cols-2">
				{#each data.kinds as k (k.id)}
					<div class="flex flex-col gap-4 bg-card px-4 py-5 md:flex-row md:items-start md:gap-5 md:p-7">
						<div class="flex min-w-0 flex-1 items-center gap-3.5 md:items-start md:gap-5">
							<span class="md:hidden"><Tile id={k.id} size={48} /></span>
							<span class="hidden md:block"><Tile id={k.id} size={56} /></span>
							<div class="flex min-w-0 flex-col gap-0.5 md:gap-1.5">
								<h3 class="font-display text-[22px] leading-7 font-medium tracking-[-0.02em] md:text-[26px] md:leading-8">{k.name}</h3>
								<p class="text-[13px] leading-[18px] text-muted md:text-sm md:leading-5">{k.description}</p>
								<p class="hidden pt-3.5 text-[13px] text-muted md:block">
									Your apps get <span class="font-mono text-ink">{k.envName}</span>
								</p>
							</div>
						</div>
						<div class="flex items-center justify-between gap-3 md:contents">
							<p class="text-[13px] text-muted md:hidden">
								Your apps get <span class="font-mono text-ink">{k.envName}</span>
							</p>
							{#if k.available}
								<button
									type="button"
									onclick={() => openDatabase(k)}
									class="h-10 w-24 shrink-0 rounded border border-line bg-card text-sm font-semibold md:h-11 md:w-[120px]"
								>
									Create
								</button>
							{:else}
								<span class="max-w-[160px] shrink-0 text-right text-[13px] text-muted">Update the Dukoi app to get this</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	{#if data && data.templates.length > 0}
		<section class="flex flex-col gap-3 pt-2 md:gap-3.5">
			<h2 class="font-display text-[22px] leading-7 font-medium">Apps</h2>
			<div class="grid gap-px bg-divider md:grid-cols-2 lg:grid-cols-4">
				{#each data.templates as t (t.id)}
					<button
						type="button"
						onclick={() => openTemplate(t)}
						class="flex items-center gap-3.5 bg-card px-4 py-3.5 text-left transition-colors hover:bg-white/60 md:flex-col md:items-start md:gap-4 md:p-[22px]"
					>
						<Tile id={t.id} />
						<span class="flex min-w-0 flex-1 flex-col gap-0.5">
							<span class="font-display text-[17px] leading-[22px] font-medium">{t.name}</span>
							<span class="text-[13px] leading-[18px] text-muted">{t.description}</span>
						</span>
						<Icon name="arrow-right" class="text-muted md:hidden" />
					</button>
				{/each}
			</div>
		</section>
	{/if}
</div>

{#if kind}
	{@const k = kind}
	<Sheet bind:open={dbOpen} tile={k.id} title="New {k.name}" busy={dbBusy}>
		<p class="text-sm leading-5 text-muted">
			Runs on {phoneName} next to your apps. Data is saved to the phone, so it survives restarts.
			{#if k.id === 'postgres'}It uses about 400 MB of memory while it runs.{/if}
		</p>

		<label class="flex flex-col gap-2">
			<span class="text-[13px] font-medium">Name</span>
			<input
				bind:value={dbName}
				spellcheck="false"
				autocomplete="off"
				class="h-11 rounded border border-line px-3.5 font-mono text-sm outline-violet"
			/>
		</label>

		{#if data && data.apps.length > 0}
			<div class="flex flex-col gap-3">
				<div class="flex flex-col gap-1">
					<span class="text-[13px] font-medium">Give these apps <span class="font-mono">{k.envName}</span></span>
					<span class="text-[13px] text-muted">They restart once to pick it up.</span>
				</div>
				<div class="flex flex-col gap-px border border-divider bg-divider">
					{#each data.apps as app (app)}
						<button
							type="button"
							role="checkbox"
							aria-checked={dbApps.includes(app)}
							onclick={() => (dbApps = toggle(dbApps, app))}
							class="flex h-[52px] items-center gap-3.5 bg-card px-4 text-left"
						>
							<Check checked={dbApps.includes(app)} />
							<span class="truncate font-display text-[17px] font-medium">{app}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<button
			type="button"
			role="checkbox"
			aria-checked={dbWifi}
			onclick={() => (dbWifi = !dbWifi)}
			class="flex items-start gap-3.5 border border-divider p-4 text-left"
		>
			<Check checked={dbWifi} />
			<span class="flex flex-col gap-1">
				<span class="text-sm leading-5 font-medium">Also reachable on Wi-Fi</span>
				<span class="text-[13px] leading-[18px] text-muted">
					Your computer and other devices on this network can connect. Dukoi adds a password.
				</span>
			</span>
		</button>

		{#snippet footer()}
			{#if dbError}<p class="text-sm text-crashed">{dbError}</p>{/if}
			<p class="text-[13px] text-muted">It never gets a public link.</p>
			<div class="flex gap-3">
				<button
					type="button"
					disabled={dbBusy}
					onclick={create}
					class="h-12 flex-1 rounded bg-violet text-[15px] font-semibold text-white disabled:opacity-70 md:h-11 md:text-sm"
				>
					{dbBusy ? `Starting ${k.name}…` : `Create ${k.name}`}
				</button>
				<button
					type="button"
					disabled={dbBusy}
					onclick={() => (dbOpen = false)}
					class="hidden h-11 w-[120px] rounded border border-line text-sm font-semibold disabled:opacity-50 md:block"
				>
					Cancel
				</button>
			</div>
		{/snippet}
	</Sheet>
{/if}

{#if template}
	{@const t = template}
	<Sheet bind:open={tplOpen} tile={t.id} title={t.name} busy={tplBusy}>
		<p class="text-sm leading-5 text-muted">
			{t.description}. Deploys from the copy on {phoneName} as an app called
			<span class="font-mono text-ink">{t.id}</span>. To change it, get the code with
			<span class="font-mono text-ink">dukoi init {t.id}</span> and edit <span class="font-mono text-ink">{t.edit}</span>.
		</p>
		{#if exists}
			<p class="bg-[#fbefd2] px-4 py-3 text-sm text-[#7a4d08]">
				You already have an app called {t.id}. This puts the template back over it.
			</p>
		{/if}
		{#if t.secret}
			<label class="flex flex-col gap-2">
				<span class="text-[13px] font-medium"><span class="font-mono">{t.secret}</span></span>
				<input
					bind:value={tplSecret}
					type="password"
					spellcheck="false"
					autocomplete="off"
					class="h-11 rounded border border-line px-3.5 font-mono text-sm outline-violet"
				/>
				<span class="text-[13px] text-muted">Saved on the phone as a setting. It never comes back to this computer.</span>
			</label>
		{/if}

		{#snippet footer()}
			{#if tplError}<p class="text-sm text-crashed">{tplError}</p>{/if}
			<div class="flex gap-3">
				<button
					type="button"
					disabled={tplBusy || (!!t.secret && !tplSecret.trim())}
					onclick={deploy}
					class="h-12 flex-1 rounded bg-violet text-[15px] font-semibold text-white disabled:opacity-50 md:h-11 md:text-sm"
				>
					{tplBusy ? 'Deploying…' : 'Deploy'}
				</button>
				<button
					type="button"
					disabled={tplBusy}
					onclick={() => (tplOpen = false)}
					class="hidden h-11 w-[120px] rounded border border-line text-sm font-semibold disabled:opacity-50 md:block"
				>
					Cancel
				</button>
			</div>
		{/snippet}
	</Sheet>
{/if}

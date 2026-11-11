<script lang="ts">
import CommandBox from '#lib/components/CommandBox.svelte'
import Confirm from '#lib/components/Confirm.svelte'
import Icon from '#lib/components/Icon.svelte'
import ProblemNote from '#lib/components/ProblemNote.svelte'
import { disconnectCloudflare, getSettings, stopAll, unpair } from '#lib/settings.remote.js'
import { toast } from '#lib/toast.svelte.js'

const settings = getSettings()
const data = $derived(settings.current)

let confirming = $state<'cloudflare' | 'stop' | 'unpair' | null>(null)
let unpaired = $state<{ phone: string; phoneForgot: boolean } | null>(null)

const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`

/** "sanju on Sanjus-iMac" → "SS", like the phone app. */
function initials(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter((w) => w && w.toLowerCase() !== 'on')
  return (
    words
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  )
}

function paired(iso: string): string {
  const d = new Date(iso)
  return `Paired ${d.getDate()} ${d.toLocaleString([], { month: 'short' })}`
}

function message(err: unknown): string {
  return (err as { body?: { message?: string } }).body?.message ?? 'Something went wrong.'
}

async function doDisconnect() {
  try {
    await disconnectCloudflare()
    toast.show('Disconnected from Cloudflare')
  } catch (err) {
    toast.show(message(err), true)
    throw err
  }
}

async function doStopAll() {
  try {
    const { total, failed } = await stopAll()
    if (failed === 0) toast.show(total === 1 ? 'Stopped 1 app' : `Stopped all ${total} apps`)
    else toast.show(`Couldn’t stop ${failed} of ${total} apps`, true)
  } catch (err) {
    toast.show(message(err), true)
    throw err
  }
}

async function doUnpair() {
  unpaired = await unpair()
}

const hostnames = $derived(data?.cloudflare?.domains.map((d) => d.hostname) ?? [])
const cloudflareImpact = $derived(
  hostnames.length === 0
    ? 'No apps use it right now. You can connect again when you add a domain.'
    : hostnames.length === 1
      ? `${hostnames[0]} will stop working. Dukoi removes only the DNS records it made.`
      : `${hostnames.length} public links will stop working. Dukoi removes only the DNS records it made.`,
)
</script>

<div class="flex flex-col gap-5 md:gap-6">
  <a href="/" class="flex w-fit items-center gap-1 text-sm font-semibold text-violet">
    <Icon name="arrow-left" size={20} />Apps
  </a>
  <h1 class="font-display text-[36px] leading-10 font-medium tracking-[-0.03em] md:text-[44px] md:leading-[48px]">Settings</h1>

  {#if unpaired}
    <div class="flex max-w-[720px] flex-col gap-4 pt-2">
      <p class="text-[15px] leading-[22px]">
        This computer is no longer paired with {unpaired.phone}.
        {#if !unpaired.phoneForgot}The phone wasn’t reachable, so remove this computer in the Dukoi app too.{/if}
      </p>
      <p class="text-[15px] leading-[22px] text-muted">To pair again, run this, then start the dashboard again.</p>
      <div class="w-fit"><CommandBox command="npx dukoi pair" /></div>
    </div>
  {:else}
    {#if data?.problem}<div class="max-w-[720px]"><ProblemNote problem={data.problem} /></div>{/if}

    <div class="flex w-full max-w-[720px] flex-col gap-10 pt-2">
      {#if data?.status}
        {@const s = data.status}
        <section class="flex flex-col gap-3">
          <h2 class="font-display text-[22px] leading-7 font-medium">This phone</h2>
          <div class="flex flex-col gap-px">
            {#each [['Name', s.name, true], ['Model', `${s.model}, Android ${s.android}`, false], ['Address', data.address, true], ['Storage', s.storage ? `${gb(s.storage.freeMb)} free of ${gb(s.storage.totalMb)}` : '–', false], ['Dukoi', `${s.agentVersion} on Node ${s.nodeVersion.replace(/^v/, '')}`, false]] as [label, value, mono] (label)}
              <div class="flex items-center justify-between gap-4 bg-card px-4 py-3.5 md:px-5">
                <span class="text-sm text-muted">{label}</span>
                <span class="truncate text-right {mono ? 'font-mono text-[13px]' : 'text-sm font-medium'}">{value}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if data && data.computers.length > 0}
        <section class="flex flex-col gap-3">
          <h2 class="font-display text-[22px] leading-7 font-medium">Computers</h2>
          <div class="flex flex-col gap-px">
            {#each data.computers as pc (pc.publicKey)}
              <div class="flex items-center gap-3.5 bg-card px-4 py-3.5 md:px-5">
                <span class="grid size-9 shrink-0 place-items-center bg-[#ebe4fb] text-[13px] font-semibold text-violet">{initials(pc.name)}</span>
                <span class="min-w-0 flex-1 truncate text-[15px] font-semibold">{pc.name}</span>
                <span class="shrink-0 text-[13px] text-muted {pc.self ? 'font-medium' : ''}">{pc.self ? 'This computer' : paired(pc.pairedAt)}</span>
              </div>
            {/each}
          </div>
          <p class="text-[13px] text-muted">Remove a computer from the Dukoi app on the phone.</p>
        </section>
      {/if}

      {#if data?.cloudflare?.loggedIn}
        {@const cf = data.cloudflare}
        <section class="flex flex-col gap-3">
          <h2 class="font-display text-[22px] leading-7 font-medium">Cloudflare</h2>
          <div class="flex items-center gap-3.5 bg-card px-4 py-3.5 md:px-5">
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="truncate text-[15px] font-semibold">{cf.zone ?? 'Connected'}</span>
              <span class="truncate text-[13px] text-muted">
                {cf.domains.length === 0 ? 'No apps yet' : `Used by ${cf.domains.map((d) => d.app).join(', ')}`}
              </span>
            </div>
            <button type="button" onclick={() => (confirming = 'cloudflare')} class="shrink-0 text-sm font-semibold text-violet">Disconnect</button>
          </div>
        </section>
      {/if}

      {#if data && !data.problem}
        <div class="flex flex-wrap items-center gap-6 pt-2">
          {#if data.status && data.status.apps.total > 0}
            <button type="button" onclick={() => (confirming = 'stop')} class="h-11 rounded bg-soft-red px-6 text-sm font-semibold text-crashed">
              Stop all apps
            </button>
          {/if}
          <button type="button" onclick={() => (confirming = 'unpair')} class="text-sm font-semibold">Unpair this computer</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<Confirm
  bind:open={() => confirming === 'cloudflare', (v) => !v && (confirming = null)}
  title="Disconnect Cloudflare?"
  body={cloudflareImpact}
  action="Disconnect"
  busyLabel="Disconnecting"
  onconfirm={doDisconnect}
/>
<Confirm
  bind:open={() => confirming === 'stop', (v) => !v && (confirming = null)}
  title="Stop all apps?"
  body="Every app on the phone stops and stays stopped after a reboot, until you start it again."
  action="Stop all apps"
  busyLabel="Stopping"
  onconfirm={doStopAll}
/>
<Confirm
  bind:open={() => confirming === 'unpair', (v) => !v && (confirming = null)}
  title="Unpair this computer?"
  body="This computer forgets the phone, and the phone forgets this computer. The CLI and this dashboard stop working until you pair again."
  action="Unpair"
  busyLabel="Unpairing"
  onconfirm={doUnpair}
/>

<script lang="ts">
// Every phone model people have benchmarked with `dukoi bench --share`.
// The page is static; the numbers come from /api/bench (site/bench-api.ts) in the browser.
import { onMount } from 'svelte'
import CopyCommand from '#lib/components/CopyCommand.svelte'
import Icon from '#lib/components/Icon.svelte'

interface Model {
  slug: string
  maker: string | null
  model: string
  chip: string | null
  ramGb: number
  lab: boolean
  phones: number
  runs: number
  wifi: { rps: number; p99Ms: number }
  tunnel: { rps: number; p99Ms: number } | null
  hot: { rps: number; p99Ms: number; batteryC: number | null } | null
}

type View = 'tunnel' | 'wifi' | 'hot'
const views: { id: View; label: string }[] = [
  { id: 'tunnel', label: 'Through the tunnel' },
  { id: 'wifi', label: 'On Wi-Fi' },
  { id: 'hot', label: 'After 10 minutes' },
]

let models = $state<Model[] | null>(null)
let totals = $state({ phones: 0, runs: 0 })
let failed = $state(false)
let view = $state<View>('tunnel')
let query = $state('')

onMount(async () => {
  try {
    const res = await fetch('/api/bench')
    if (!res.ok) throw new Error(String(res.status))
    const board = (await res.json()) as { models: Model[]; phones: number; runs: number }
    models = board.models
    totals = { phones: board.phones, runs: board.runs }
  } catch {
    failed = true
  }
})

const numbers = (m: Model) => m[view]
const rows = $derived(
  (models ?? [])
    .filter((m) => numbers(m))
    .filter((m) => `${m.model} ${m.chip ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (numbers(b)?.rps ?? 0) - (numbers(a)?.rps ?? 0)),
)
const top = $derived(Math.max(1, ...rows.map((m) => numbers(m)?.rps ?? 0)))
const fmt = (n: number) => n.toLocaleString('en-US')
const ms = (n: number) => (n < 10 ? n.toFixed(1) : String(Math.round(n)))
const hot = (c: number | null | undefined) => typeof c === 'number' && c >= 44
</script>

<svelte:head>
  <title>Benchmarks: how fast is your old phone? · Dukoi</title>
  <meta name="description" content="Requests a second, latency and temperature for every phone people have run dukoi bench on." />
</svelte:head>

<section class="flex flex-col gap-6 px-5 pt-6 pb-10 lg:gap-9 lg:px-16 lg:pt-[72px] lg:pb-12">
  <h1 class="font-display text-[44px] leading-[46px] font-medium tracking-[-0.04em] text-balance lg:text-[88px] lg:leading-[88px]">
    How fast is your old phone?
  </h1>
  <p class="max-w-[720px] text-[17px] leading-[26px] text-muted lg:text-[19px] lg:leading-[30px]">
    {#if totals.runs}{fmt(totals.phones)} phones, {fmt(totals.runs)} runs.{/if}
    Each run is the same notes API under 50 connections for 60 seconds. Lab phones are ones we test on every release.
  </p>
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
    <span class="text-[15px] font-medium">Add your phone</span>
    <CopyCommand command="dukoi bench --share" size="md" class="sm:w-[300px]" />
  </div>
</section>

<section class="px-5 pb-14 lg:px-16 lg:pb-24">
  <div class="flex flex-col bg-card">
    <div class="flex flex-col gap-3 border-b border-divider p-4 md:flex-row md:items-center md:justify-between lg:px-7 lg:py-5">
      <div class="flex gap-1 overflow-x-auto bg-canvas p-1 [scrollbar-width:none]" role="tablist" aria-label="Which numbers">
        {#each views as v (v.id)}
          <button
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onclick={() => (view = v.id)}
            class="shrink-0 px-3.5 py-2 text-sm font-medium whitespace-nowrap {view === v.id ? 'bg-card text-ink' : 'text-muted hover:text-ink'}"
          >{v.label}</button>
        {/each}
      </div>
      <label class="flex items-center gap-2.5 border border-line px-3.5 py-2.5 md:w-[280px]">
        <Icon name="search-01" class="size-[18px] text-muted" />
        <input bind:value={query} placeholder="Find a phone" class="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
      </label>
    </div>

    {#if failed}
      <p class="px-7 py-16 text-center text-[15px] text-muted">The numbers didn’t load. Refresh the page to try again.</p>
    {:else if models === null}
      <p class="px-7 py-16 text-center text-[15px] text-muted">Loading…</p>
    {:else if rows.length === 0}
      <p class="px-7 py-16 text-center text-[15px] text-muted">
        {query ? `No phone matches “${query}”.` : 'No phones here yet. Run dukoi bench --share to be the first.'}
      </p>
    {:else}
      <div class="hidden items-center gap-6 border-b border-divider px-7 py-3.5 text-[13px] font-medium text-muted lg:flex">
        <span class="w-8 shrink-0">#</span>
        <span class="flex-1">Phone</span>
        <span class="w-[440px] shrink-0">Requests a second</span>
        <span class="w-20 shrink-0 text-right">p99</span>
        <span class="w-20 shrink-0 text-right">Hot</span>
        <span class="w-16 shrink-0 text-right">Runs</span>
      </div>
      <ol>
        {#each rows as m, i (m.slug)}
          {@const n = numbers(m)}
          <li id={m.slug} class="flex flex-col gap-3 border-b border-divider px-4 py-4 last:border-b-0 lg:flex-row lg:items-center lg:gap-6 lg:px-7 lg:py-[18px]">
            <div class="flex flex-1 items-start gap-3 lg:contents">
              <span class="w-6 shrink-0 pt-1 font-mono text-[15px] text-muted lg:w-8 lg:pt-0">{i + 1}</span>
              <div class="flex flex-1 flex-col gap-0.5">
                <div class="flex items-center gap-2.5">
                  <span class="font-display text-lg leading-6 font-medium lg:text-xl lg:leading-[26px]">{m.model}</span>
                  {#if m.lab}<span class="bg-lavender px-2 py-0.5 text-xs font-semibold text-violet">Lab</span>{/if}
                </div>
                <span class="text-sm text-muted">{[m.chip, `${m.ramGb} GB`].filter(Boolean).join(', ')}</span>
              </div>
            </div>
            <div class="flex items-center gap-3 pl-9 lg:w-[440px] lg:shrink-0 lg:pl-0">
              <div class="h-6 max-w-[360px] flex-1 lg:h-7">
                <div class="h-full {i === 0 ? 'bg-violet' : 'bg-[#9b6cf7]'}" style="width: {((n?.rps ?? 0) / top) * 100}%"></div>
              </div>
              <span class="w-16 shrink-0 font-mono text-[15px] font-medium">{fmt(n?.rps ?? 0)}</span>
            </div>
            <div class="flex gap-5 pl-9 font-mono text-sm lg:contents lg:pl-0 lg:text-[15px]">
              <span class="lg:w-20 lg:shrink-0 lg:text-right">{ms(n?.p99Ms ?? 0)} ms<span class="text-muted lg:hidden">{' '}p99</span></span>
              <span class="lg:w-20 lg:shrink-0 lg:text-right {hot(m.hot?.batteryC) ? 'text-orange' : ''}"
                >{m.hot?.batteryC != null ? `${m.hot.batteryC} °C` : '–'}<span class="text-muted lg:hidden">{' '}hot</span></span
              >
              <span class="text-muted lg:w-16 lg:shrink-0 lg:text-right">{m.runs}<span class="lg:hidden">{' '}{m.runs === 1 ? 'run' : 'runs'}</span></span>
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
  <p class="mt-5 max-w-[760px] text-sm leading-[22px] text-muted">
    Each phone counts once, as the median of its runs. A model shows once it has 3 runs. Through the tunnel depends on the
    home internet as much as the phone, so On Wi-Fi shows what the phone can do by itself.
  </p>
</section>

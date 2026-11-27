<script lang="ts">
import AgentPrompt from '#lib/components/AgentPrompt.svelte'
import ApkButton from '#lib/components/ApkButton.svelte'
import CopyCommand from '#lib/components/CopyCommand.svelte'
import Icon from '#lib/components/Icon.svelte'
import WelcomeIllustration from '#lib/components/WelcomeIllustration.svelte'
import { INSTALL } from '#lib/links.js'
import { reveal } from '#lib/reveal.js'
import { templates } from '#lib/templates.js'

const steps = [
  {
    title: 'Install the app',
    body: 'On a spare Android phone. Four taps get it past the battery savers that kill servers.',
    command: null,
  },
  {
    title: 'Pair your computer',
    body: 'Install the CLI, then pair on the same Wi-Fi. Tap Approve on the phone. No passwords.',
    command: 'dukoi pair',
  },
  {
    title: 'Deploy',
    body: 'From your app’s folder. You get a URL, and a public one when you want it.',
    command: 'dukoi deploy',
  },
]

// Interactive micro-demos inside the feature tiles (quiet, zero layout shift).
let replayingLogs = $state(false)
function replayLogs() {
  replayingLogs = true
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      replayingLogs = false
    })
  })
}

const releases = ['0006', '0005'] as const
let liveRelease = $state<(typeof releases)[number]>('0006')
let undoKick = $state(false)
let undoTimer: ReturnType<typeof setTimeout> | undefined
function selectRelease(release: (typeof releases)[number]) {
  if (liveRelease === release) return
  liveRelease = release
  undoKick = true
  clearTimeout(undoTimer)
  undoTimer = setTimeout(() => (undoKick = false), 220)
}

const liveLogSamples = ['', 'GET / 200 2ms', 'POST /notes 201 4ms', 'GET /health 200 1ms'] as const
let liveLogIndex = $state(0)
function cycleLiveLog() {
  liveLogIndex = (liveLogIndex + 1) % liveLogSamples.length
}

const dashboardApps = [
  { name: 'hono-api', initial: 'Running' as const, link: 'hono-api.example.com' },
  { name: 'portfolio', initial: 'Running' as const, link: 'Wi-Fi only' },
  { name: 'telegram-bot', initial: 'Restarting' as const, link: 'No link' },
]
let appStates = $state<Record<string, 'Running' | 'Restarting'>>({
  'hono-api': 'Running',
  portfolio: 'Running',
  'telegram-bot': 'Restarting',
})
const restartTimers = new Map<string, ReturnType<typeof setTimeout>>()
function toggleDashApp(name: string) {
  const existing = restartTimers.get(name)
  if (existing) clearTimeout(existing)

  if (appStates[name] === 'Restarting') {
    appStates[name] = 'Running'
    return
  }

  appStates[name] = 'Restarting'
  restartTimers.set(
    name,
    setTimeout(() => {
      appStates[name] = 'Running'
      restartTimers.delete(name)
    }, 900),
  )
}

let batteryCapOn = $state(true)
let batteryKick = $state(false)
let batteryTimer: ReturnType<typeof setTimeout> | undefined
function toggleBatteryCap() {
  batteryCapOn = !batteryCapOn
  if (batteryCapOn) {
    batteryKick = true
    clearTimeout(batteryTimer)
    batteryTimer = setTimeout(() => (batteryKick = false), 220)
  }
}

const compare = [
  ['Each month', '$5', '$0'],
  ['CPU', '1 vCPU', '8 cores'],
  ['Memory', '1 GB', '6 GB'],
  ['Storage', '25 GB', '128 GB'],
  ['Power', 'Someone else’s data centre', '2 to 5 watts, with a battery for power cuts'],
]

const sectionTitle =
  'font-display text-[34px] leading-[38px] font-medium tracking-[-0.03em] lg:text-5xl lg:leading-[52px]'
const tileTitle =
  'font-display text-[23px] leading-7 font-medium tracking-[-0.02em] lg:text-[26px] lg:leading-8'
const tileBody = 'text-[15px] leading-[23px] text-body'
const tile = 'feature-tile flex flex-col justify-between gap-6 p-6 lg:p-8'
const chip = 'grid size-12 place-items-center bg-white/70'
</script>

<!-- Hero -->
<section class="flex flex-col gap-5 px-5 pt-2 pb-14 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:px-16 lg:py-14">
  <div class="hero-art-enter flex h-[230px] items-center justify-center overflow-hidden lg:order-2 lg:h-[520px] lg:flex-1" style="--delay: 90ms">
    <WelcomeIllustration class="size-[300px] max-w-none lg:size-[540px]" />
  </div>
  <div class="flex flex-col gap-5 lg:w-[700px] lg:shrink-0 lg:gap-7">
    <h1 class="hero-enter font-display text-[44px] leading-[46px] font-medium tracking-[-0.04em] text-balance sm:text-5xl sm:leading-[50px] lg:text-[88px] lg:leading-[88px] lg:text-wrap" style="--delay: 0ms">
      Turn an old phone into a server
    </h1>
    <p class="hero-enter text-[17px] leading-[26px] text-muted lg:max-w-[560px] lg:text-[19px] lg:leading-[30px]" style="--delay: 65ms">
      Deploy real apps to the Android phone in your drawer and get a live URL. No root, no Termux, no cloud bill.
    </p>
    <!-- As wide as the install line, with the two buttons splitting it -->
    <div class="hero-enter flex flex-col gap-3 pt-1 sm:w-fit lg:gap-4 lg:pt-2" style="--delay: 130ms">
      <CopyCommand command={INSTALL} />
      <div class="grid gap-3 sm:grid-cols-2 lg:gap-4">
        <AgentPrompt />
        <ApkButton tone="muted" />
      </div>
    </div>
  </div>
</section>

<!-- Steps -->
<section id="install" class="flex flex-col gap-6 px-5 pt-4 pb-14 lg:gap-10 lg:px-16 lg:pt-12 lg:pb-[88px]">
  <h2 use:reveal class={sectionTitle}>Live in two minutes</h2>
  <ol class="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-6">
    {#each steps as step, i (step.title)}
      <li use:reveal={{ delay: i * 60 }} class="step-card flex flex-col gap-2.5 bg-card px-5 py-6 lg:gap-3.5 lg:p-8">
        <div class="flex items-baseline gap-2.5 lg:flex-col lg:gap-3.5">
          <span class="step-num font-display text-lg font-medium text-violet lg:text-xl" aria-hidden="true">{i + 1}</span>
          <h3 class="font-display text-[22px] leading-7 font-medium lg:text-[26px] lg:leading-8">{step.title}</h3>
        </div>
        <p class="text-[15px] leading-[22px] text-muted lg:text-base lg:leading-6">{step.body}</p>
        {#if step.command}
          <CopyCommand command={step.command} size="sm" class="mt-1.5 w-fit lg:mt-2.5" />
        {:else}
          <ApkButton size="md" class="mt-2.5 hidden w-fit lg:flex" />
        {/if}
      </li>
    {/each}
  </ol>
</section>

<!-- Features -->
<section class="flex flex-col gap-6 px-5 pt-2 pb-14 lg:gap-10 lg:px-16 lg:pt-4 lg:pb-24">
  <h2 use:reveal class="{sectionTitle} lg:max-w-[760px]">Everything a small server needs</h2>
  <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4">
    <div use:reveal={{ delay: 0 }} class="{tile} bg-lavender md:col-span-2 lg:min-h-[380px]">
      <div class="flex flex-col gap-3.5 lg:max-w-[460px]">
        <span class={chip} data-hover="spin"><Icon name="refresh" class="feature-chip-icon size-6 text-violet" /></span>
        <h3 class="font-display text-[23px] leading-7 font-medium tracking-[-0.02em] lg:text-[30px] lg:leading-9">Apps that stay up</h3>
        <p class="text-[15px] leading-[23px] text-body lg:text-base lg:leading-6">
          Android kills background apps to save battery. Dukoi runs as a foreground service, restarts anything that stops within seconds, and starts it all again after a reboot.
        </p>
      </div>
      <button
        type="button"
        onclick={replayLogs}
        data-md-skip
        data-replaying={replayingLogs}
        aria-label="Replay automatic restart log"
        class="pressable-row flex cursor-pointer flex-col gap-2 bg-night px-4 py-3.5 text-left font-mono text-[13px] leading-5 hover:bg-[#1c1b22] lg:px-5 lg:py-[18px]"
      >
        <span class="log-line flex gap-3.5" style="--log-delay: 90ms"><span class="w-[72px] shrink-0 text-log-time">09:31:40</span><span class="text-log-note"><span class="status-pulse inline-block">●</span> Android stopped the app to save battery. Restarted now.</span></span>
        <span class="log-line flex gap-3.5" style="--log-delay: 210ms"><span class="w-[72px] shrink-0 text-log-time">09:31:41</span><span class="text-log-text">hono-api listening on 40379</span></span>
        <span class="log-line flex gap-3.5" style="--log-delay: 330ms"><span class="w-[72px] shrink-0 text-log-time">09:33:02</span><span class="text-log-text">GET /notes 200 3ms</span></span>
      </button>
    </div>

    <div use:reveal={{ delay: 60 }} class="{tile} bg-mint lg:min-h-[380px]">
      <div class="flex flex-col gap-3.5">
        <span class={chip} data-hover="pop"><Icon name="globe-02" class="feature-chip-icon size-6 text-running" /></span>
        <h3 class={tileTitle}>A public URL, no router setup</h3>
        <p class={tileBody}>Works behind CGNAT. A quick link in seconds, or your own domain through Cloudflare.</p>
      </div>
      <p aria-hidden="true" class="url-bar flex items-center gap-2.5 bg-white px-4 py-3.5 font-mono text-sm">
        <span class="status-beacon size-2 shrink-0 rounded-full bg-running text-running"></span><span class="truncate">hono-api.example.com</span>
      </p>
    </div>

    <div use:reveal={{ delay: 0 }} class="{tile} bg-peach lg:min-h-[340px]">
      <div class="flex flex-col gap-3.5">
        <span class={chip} data-hover="undo">
          <span class="feature-chip-icon inline-flex" data-kick={undoKick ? 'undo' : undefined}>
            <Icon name="undo-02" class="size-6 text-orange" />
          </span>
        </span>
        <h3 class={tileTitle}>Roll back in seconds</h3>
        <p class={tileBody}>Every deploy is a release. A bad one is one command away from gone.</p>
      </div>
      <div data-md-skip class="flex flex-col gap-px">
        {#each releases as release (release)}
          {@const isLive = liveRelease === release}
          <button
            type="button"
            onclick={() => selectRelease(release)}
            aria-label={isLive ? `Release ${release} is live` : `Preview rolling back to release ${release}`}
            class="pressable-row relative flex cursor-pointer items-center justify-between bg-white px-4 py-3 text-left text-[13px] hover:bg-[#fffbf8]"
          >
            <span class="release-rail absolute inset-y-2 left-0 w-[2.5px] bg-running" data-live={isLive} aria-hidden="true"></span>
            <span class="font-mono">{release}</span>
            <span class="grid place-items-end">
              <span class="swap-item flex items-center gap-1.5 font-medium" data-active={isLive}>
                <span class="status-beacon size-[7px] rounded-full bg-running text-running"></span>Live
              </span>
              <span class="swap-item font-semibold text-orange" data-active={!isLive}>
                Roll back
              </span>
            </span>
          </button>
        {/each}
      </div>
    </div>

    <div use:reveal={{ delay: 55 }} class="{tile} bg-sky lg:min-h-[340px]">
      <div class="flex flex-col gap-3.5">
        <span class={chip} data-hover="pop"><Icon name="terminal" class="feature-chip-icon size-6 text-blue" /></span>
        <h3 class={tileTitle}>Live logs, anywhere</h3>
        <p class={tileBody}>On the phone, in your terminal and in the web dashboard. New lines in under a second.</p>
      </div>
      <button
        type="button"
        onclick={cycleLiveLog}
        data-md-skip
        aria-label="Preview a streamed log line"
        class="pressable-row flex h-11 cursor-pointer items-center justify-between gap-3 bg-white px-4 text-left font-mono text-[13px] hover:bg-[#f7fbff]"
      >
        <span class="flex shrink-0 items-center">
          <span class="text-muted">$</span>&nbsp;dukoi logs<span class="terminal-caret ml-1 inline-block h-3.5 w-[6px] bg-blue/75"></span>
        </span>
        <span class="grid min-w-0 place-items-end text-xs text-muted">
          {#each liveLogSamples as sample, idx (sample || 'idle')}
            <span class="swap-item truncate" data-active={liveLogIndex === idx}>{sample}</span>
          {/each}
        </span>
      </button>
    </div>

    <div use:reveal={{ delay: 110 }} class="{tile} bg-rose lg:min-h-[340px]">
      <div class="flex flex-col gap-3.5">
        <span class={chip} data-hover="lift"><Icon name="shield-02" class="feature-chip-icon size-6 text-pink" /></span>
        <h3 class={tileTitle}>Safe by default</h3>
        <p class={tileBody}>Pairing with keys, not passwords. Controls stay on your Wi-Fi and never go through a tunnel.</p>
      </div>
      <ul class="flex flex-wrap gap-2 text-[13px] font-medium">
        {#each ['No passwords', 'Signed requests', 'Opt-in telemetry'] as label (label)}
          <li class="trust-pill bg-white px-3 py-2">{label}</li>
        {/each}
      </ul>
    </div>

    <div use:reveal={{ delay: 0 }} class="feature-tile hidden gap-6 bg-card p-8 lg:col-span-2 lg:flex lg:min-h-[320px] xl:gap-8">
      <div class="flex w-[250px] shrink-0 flex-col gap-3.5 xl:w-[300px]">
        <span class="grid size-12 place-items-center bg-lavender" data-hover="pop"><Icon name="dashboard-square-01" class="feature-chip-icon size-6 text-violet" /></span>
        <h3 class={tileTitle}>A dashboard on your computer</h3>
        <p class={tileBody}>Every app, its status and its logs, with Restart and Roll back a click away. Only your computer can open it.</p>
      </div>
      <div data-md-skip class="flex min-w-0 flex-1 flex-col gap-px self-center bg-divider">
        {#each dashboardApps as app (app.name)}
          {@const state = appStates[app.name]}
          <button
            type="button"
            onclick={() => toggleDashApp(app.name)}
            aria-label="{app.name}: {state}. Click to preview restart."
            class="dash-row pressable-row flex cursor-pointer items-center gap-3 bg-[#f7f6f9] px-4 py-4 text-left xl:px-[18px]"
          >
            <span class="min-w-0 flex-1 truncate font-display text-[17px] font-medium">{app.name}</span>
            <span class="grid w-[92px] shrink-0 place-items-start text-[13px] font-medium">
              <span class="swap-item flex items-center gap-1.5" data-active={state === 'Running'}>
                <span class="size-[7px] rounded-full bg-running"></span>Running
              </span>
              <span class="swap-item flex items-center gap-1.5" data-active={state === 'Restarting'}>
                <span class="status-pulse size-[7px] rounded-full bg-restarting"></span>Restarting
              </span>
            </span>
            <span class="w-36 shrink-0 truncate xl:w-40 {app.link.includes('.') ? 'font-mono text-xs text-violet' : 'text-[13px] text-muted'}">{app.link}</span>
          </button>
        {/each}
      </div>
    </div>

    <div use:reveal={{ delay: 60 }} class="{tile} bg-butter md:col-span-2 lg:col-span-1 lg:min-h-[320px]">
      <div class="flex flex-col gap-3.5">
        <span class={chip} data-hover="lift">
          <span class="feature-chip-icon inline-flex" data-kick={batteryKick ? 'battery' : undefined}>
            <Icon name="battery-charging-01" class="size-6 text-amber" />
          </span>
        </span>
        <h3 class={tileTitle}>Battery care</h3>
        <p class={tileBody}>A phone on charge all day wears out its battery. Dukoi watches it and helps you cap it at 80%.</p>
      </div>
      <button
        type="button"
        onclick={toggleBatteryCap}
        data-md-skip
        aria-pressed={batteryCapOn}
        aria-label="Preview stop charging at 80% toggle"
        class="pressable-row flex cursor-pointer items-center justify-between bg-white px-4 py-3.5 text-left text-sm hover:bg-[#fffdf6]"
      >
        <span class="font-semibold">Stop charging at 80%</span>
        <span class="grid place-items-end text-[13px] font-medium">
          <span class="swap-item flex items-center gap-1.5" data-active={batteryCapOn}>
            <span class="status-beacon size-[7px] rounded-full bg-running text-running"></span>On
          </span>
          <span class="swap-item flex items-center gap-1.5 text-muted" data-active={!batteryCapOn}>
            <span class="size-[7px] rounded-full bg-line"></span>Off
          </span>
        </span>
      </button>
    </div>
  </div>
</section>

<!-- Starters -->
<section class="flex flex-col gap-5 px-5 pb-14 lg:gap-8 lg:px-16 lg:pb-24">
  <div use:reveal class="flex flex-col gap-3">
    <h2 class={sectionTitle}>Templates that deploy with zero edits</h2>
    <p class="hidden text-[17px] leading-[26px] text-muted lg:block">Pick one, and it’s live on your phone in under a minute.</p>
  </div>
  <ul class="flex flex-col gap-px bg-divider md:grid md:grid-cols-2 md:gap-3 md:bg-transparent lg:grid-cols-4 lg:gap-4">
    {#each templates as t, i (t.id)}
      <li use:reveal={{ delay: (i % 4) * 45 }} class="flex">
        <a href="/docs/templates/{t.id}" class="template-card group flex flex-1 items-center gap-3.5 bg-card px-[18px] py-4 lg:flex-col lg:items-start lg:p-6">
          <Icon name={t.icon} class="template-icon size-6 group-hover:text-violet lg:size-7" />
          <div class="flex flex-col gap-0.5 lg:gap-1">
            <h3 class="template-title font-display text-lg leading-6 font-medium group-hover:text-violet lg:text-xl lg:leading-[26px]">{t.name}</h3>
            <p class="text-sm leading-5 text-muted">{t.description}</p>
          </div>
        </a>
      </li>
    {/each}
  </ul>
</section>

<!-- Why a phone -->
<section class="flex flex-col gap-5 px-5 pb-14 lg:flex-row lg:gap-16 lg:px-16 lg:pb-28">
  <div use:reveal class="flex flex-col gap-3 lg:w-[440px] lg:shrink-0 lg:gap-4">
    <h2 class={sectionTitle}>Your old phone beats a $5 server</h2>
    <p class="text-[15px] leading-[23px] text-muted lg:text-[17px] lg:leading-[26px]">
      A flagship from 2019 has more cores, memory and storage than the server most side projects rent. And it’s already paid for.
    </p>
  </div>
  <table use:reveal={{ delay: 70 }} class="w-full flex-1 table-fixed border-collapse self-start text-left">
    <colgroup><col class="w-24 lg:w-[200px]" /><col /><col /></colgroup>
    <thead>
      <tr>
        <td class="border border-divider bg-card"></td>
        <th class="border border-divider bg-card p-3.5 text-[13px] font-semibold text-muted lg:px-6 lg:py-5 lg:text-[15px]">A $5 server</th>
        <th class="border border-divider bg-lavender p-3.5 text-[13px] font-semibold text-violet lg:px-6 lg:py-5 lg:text-[15px]">Your old phone</th>
      </tr>
    </thead>
    <tbody>
      {#each compare as [label, server, phone] (label)}
        {@const words = label === 'Power'}
        <tr class="compare-row">
          <th scope="row" class="compare-cell-base border border-divider bg-card p-3.5 text-[13px] font-normal text-muted lg:px-6 lg:py-[18px] lg:text-[15px]">{label}</th>
          <td class="compare-cell-base border border-divider bg-card p-3.5 lg:px-6 lg:py-[18px] {words ? 'text-[13px] font-medium lg:text-[15px]' : 'font-display text-lg font-medium lg:text-[22px]'}">{server}</td>
          <td class="compare-cell-accent border border-divider bg-lavender p-3.5 lg:px-6 lg:py-[18px] {words ? 'text-[13px] font-medium lg:text-[15px]' : 'font-display text-lg font-medium lg:text-[22px]'}">{phone}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<!-- Closing -->
<section class="px-5 pb-12 lg:px-16 lg:pb-20">
  <div use:reveal={{ scale: true }} class="flex flex-col gap-6 bg-night px-6 py-8 lg:gap-10 lg:p-16 xl:flex-row xl:items-center xl:justify-between xl:gap-12">
    <div class="flex flex-col gap-3 lg:max-w-[620px] lg:gap-4">
      <h2 class="font-display text-4xl leading-10 font-medium tracking-[-0.035em] text-white lg:text-[56px] lg:leading-[58px]">
        There’s a server in your drawer
      </h2>
      <p class="text-[15px] leading-[23px] text-night-muted lg:text-[17px] lg:leading-[26px]">
        Install the app, pair once, and deploy. Your first URL is two minutes away.
      </p>
    </div>
    <div class="flex flex-col gap-3 lg:w-fit lg:shrink-0 lg:gap-3.5">
      <CopyCommand command={INSTALL} size="md" tone="raised" />
      <ApkButton />
    </div>
  </div>
</section>

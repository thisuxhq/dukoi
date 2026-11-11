<script lang="ts">
import AgentPrompt from '#lib/components/AgentPrompt.svelte'
import ApkButton from '#lib/components/ApkButton.svelte'
import CopyCommand from '#lib/components/CopyCommand.svelte'
import Icon from '#lib/components/Icon.svelte'
import { APK } from '#lib/links.js'
import { templates } from '#lib/templates.js'
import welcome from '#lib/welcome.svg'

const steps = [
  {
    title: 'Install the app',
    body: 'On a spare Android phone. Four taps get it past the battery savers that kill servers.',
    command: null,
  },
  {
    title: 'Pair your computer',
    body: 'On the same Wi-Fi. Tap Approve on the phone. No passwords.',
    command: 'npx dukoi pair',
  },
  {
    title: 'Deploy',
    body: 'From your app’s folder. You get a URL, and a public one when you want it.',
    command: 'npx dukoi deploy',
  },
]

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
const tile = 'flex flex-col justify-between gap-6 p-6 lg:p-8'
const chip = 'grid size-12 place-items-center bg-white/70'
</script>

<!-- Hero -->
<section class="flex flex-col gap-5 px-5 pt-2 pb-14 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:px-16 lg:py-14">
  <div class="flex h-[230px] items-center justify-center overflow-hidden lg:order-2 lg:h-[520px] lg:flex-1">
    <img src={welcome} alt="A person relaxing next to a phone that runs their apps" class="size-[300px] max-w-none lg:size-[540px]" />
  </div>
  <div class="flex flex-col gap-5 lg:w-[700px] lg:shrink-0 lg:gap-7">
    <h1 class="font-display text-[44px] leading-[46px] font-medium tracking-[-0.04em] text-balance sm:text-5xl sm:leading-[50px] lg:text-[88px] lg:leading-[88px] lg:text-wrap">
      Turn an old phone into a server
    </h1>
    <p class="text-[17px] leading-[26px] text-muted lg:max-w-[560px] lg:text-[19px] lg:leading-[30px]">
      Deploy real apps to the Android phone in your drawer and get a live URL. No root, no Termux, no cloud bill.
    </p>
    <div class="flex flex-col gap-4 pt-1 lg:flex-row lg:items-center lg:gap-5 lg:pt-2">
      <AgentPrompt />
      <CopyCommand command="npx dukoi pair" class="lg:w-fit" />
    </div>
    <a href={APK} class="flex w-fit items-center gap-2 text-base font-semibold text-violet hover:underline">
      <Icon name="download-04" class="size-5" />Get the APK
    </a>
  </div>
</section>

<!-- Steps -->
<section id="install" class="flex flex-col gap-6 px-5 pt-4 pb-14 lg:gap-10 lg:px-16 lg:pt-12 lg:pb-[88px]">
  <h2 class={sectionTitle}>Live in two minutes</h2>
  <ol class="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-6">
    {#each steps as step, i (step.title)}
      <li class="flex flex-col gap-2.5 bg-card px-5 py-6 lg:gap-3.5 lg:p-8">
        <div class="flex items-baseline gap-2.5 lg:flex-col lg:gap-3.5">
          <span class="font-display text-lg font-medium text-violet lg:text-xl" aria-hidden="true">{i + 1}</span>
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
  <h2 class="{sectionTitle} lg:max-w-[760px]">Everything a small server needs</h2>
  <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3 lg:gap-4">
    <div class="{tile} bg-lavender md:col-span-2 lg:min-h-[380px]">
      <div class="flex flex-col gap-3.5 lg:max-w-[460px]">
        <span class={chip}><Icon name="refresh" class="size-6 text-violet" /></span>
        <h3 class="font-display text-[23px] leading-7 font-medium tracking-[-0.02em] lg:text-[30px] lg:leading-9">Apps that stay up</h3>
        <p class="text-[15px] leading-[23px] text-body lg:text-base lg:leading-6">
          Android kills background apps to save battery. Dukoi runs as a foreground service, restarts anything that stops within seconds, and starts it all again after a reboot.
        </p>
      </div>
      <div aria-hidden="true" class="flex flex-col gap-2 bg-night px-4 py-3.5 font-mono text-[13px] leading-5 lg:px-5 lg:py-[18px]">
        <p class="flex gap-3.5"><span class="w-[72px] shrink-0 text-log-time">09:31:40</span><span class="text-log-note">● Android stopped the app to save battery. Restarted now.</span></p>
        <p class="flex gap-3.5"><span class="w-[72px] shrink-0 text-log-time">09:31:41</span><span class="text-log-text">hono-api listening on 40379</span></p>
        <p class="flex gap-3.5"><span class="w-[72px] shrink-0 text-log-time">09:33:02</span><span class="text-log-text">GET /notes 200 3ms</span></p>
      </div>
    </div>

    <div class="{tile} bg-mint lg:min-h-[380px]">
      <div class="flex flex-col gap-3.5">
        <span class={chip}><Icon name="globe-02" class="size-6 text-running" /></span>
        <h3 class={tileTitle}>A public URL, no router setup</h3>
        <p class={tileBody}>Works behind CGNAT. A quick link in seconds, or your own domain through Cloudflare.</p>
      </div>
      <p aria-hidden="true" class="flex items-center gap-2.5 bg-white px-4 py-3.5 font-mono text-sm">
        <span class="size-2 rounded-full bg-running"></span>hono-api.example.com
      </p>
    </div>

    <div class="{tile} bg-peach lg:min-h-[340px]">
      <div class="flex flex-col gap-3.5">
        <span class={chip}><Icon name="undo-02" class="size-6 text-orange" /></span>
        <h3 class={tileTitle}>Roll back in seconds</h3>
        <p class={tileBody}>Every deploy is a release. A bad one is one command away from gone.</p>
      </div>
      <div aria-hidden="true" class="flex flex-col gap-px">
        <p class="flex items-center justify-between bg-white px-4 py-3 text-[13px]">
          <span class="font-mono">0006</span>
          <span class="flex items-center gap-1.5 font-medium"><span class="size-[7px] rounded-full bg-running"></span>Live</span>
        </p>
        <p class="flex items-center justify-between bg-white px-4 py-3 text-[13px]">
          <span class="font-mono">0005</span><span class="font-semibold text-orange">Roll back</span>
        </p>
      </div>
    </div>

    <div class="{tile} bg-sky lg:min-h-[340px]">
      <div class="flex flex-col gap-3.5">
        <span class={chip}><Icon name="terminal" class="size-6 text-blue" /></span>
        <h3 class={tileTitle}>Live logs, anywhere</h3>
        <p class={tileBody}>On the phone, in your terminal and in the web dashboard. New lines in under a second.</p>
      </div>
      <p aria-hidden="true" class="flex h-11 items-center bg-white px-4 font-mono text-[13px]"><span class="text-muted">$</span>&nbsp;npx dukoi logs</p>
    </div>

    <div class="{tile} bg-rose lg:min-h-[340px]">
      <div class="flex flex-col gap-3.5">
        <span class={chip}><Icon name="shield-02" class="size-6 text-pink" /></span>
        <h3 class={tileTitle}>Safe by default</h3>
        <p class={tileBody}>Pairing with keys, not passwords. Controls stay on your Wi-Fi and never go through a tunnel.</p>
      </div>
      <ul class="flex flex-wrap gap-2 text-[13px] font-medium">
        {#each ['No passwords', 'Signed requests', 'Opt-in telemetry'] as label (label)}
          <li class="bg-white px-3 py-2">{label}</li>
        {/each}
      </ul>
    </div>

    <div class="hidden gap-8 bg-card p-8 lg:col-span-2 lg:flex lg:min-h-[320px]">
      <div class="flex w-[300px] shrink-0 flex-col gap-3.5">
        <span class="grid size-12 place-items-center bg-lavender"><Icon name="dashboard-square-01" class="size-6 text-violet" /></span>
        <h3 class={tileTitle}>A dashboard on your computer</h3>
        <p class={tileBody}>Every app, its status and its logs, with Restart and Roll back a click away. Only your computer can open it.</p>
      </div>
      <div aria-hidden="true" class="flex flex-1 flex-col gap-px self-center bg-divider">
        {#each [['hono-api', 'Running', 'hono-api.example.com'], ['portfolio', 'Running', 'Wi-Fi only'], ['telegram-bot', 'Restarting', 'No link']] as [name, state, link] (name)}
          <p class="flex items-center gap-3 bg-[#f7f6f9] px-[18px] py-4">
            <span class="flex-1 font-display text-[17px] font-medium">{name}</span>
            <span class="flex w-[90px] items-center gap-1.5 text-[13px] font-medium">
              <span class="size-[7px] rounded-full {state === 'Running' ? 'bg-running' : 'bg-restarting'}"></span>{state}
            </span>
            <span class="w-40 {link.includes('.') ? 'font-mono text-xs text-violet' : 'text-[13px] text-muted'}">{link}</span>
          </p>
        {/each}
      </div>
    </div>

    <div class="{tile} bg-butter md:col-span-2 lg:col-span-1 lg:min-h-[320px]">
      <div class="flex flex-col gap-3.5">
        <span class={chip}><Icon name="battery-charging-01" class="size-6 text-amber" /></span>
        <h3 class={tileTitle}>Battery care</h3>
        <p class={tileBody}>A phone on charge all day wears out its battery. Dukoi watches it and helps you cap it at 80%.</p>
      </div>
      <p aria-hidden="true" class="flex items-center justify-between bg-white px-4 py-3.5 text-sm">
        <span class="font-semibold">Stop charging at 80%</span>
        <span class="flex items-center gap-1.5 text-[13px] font-medium"><span class="size-[7px] rounded-full bg-running"></span>On</span>
      </p>
    </div>
  </div>
</section>

<!-- Starters -->
<section class="flex flex-col gap-5 px-5 pb-14 lg:gap-8 lg:px-16 lg:pb-24">
  <div class="flex flex-col gap-3">
    <h2 class={sectionTitle}>Templates that deploy with zero edits</h2>
    <p class="hidden text-[17px] leading-[26px] text-muted lg:block">Pick one, and it’s live on your phone in under a minute.</p>
  </div>
  <ul class="flex flex-col gap-px bg-divider md:grid md:grid-cols-2 md:gap-3 md:bg-transparent lg:grid-cols-5 lg:gap-4">
    {#each templates as t (t.id)}
      <li class="flex">
        <a href="/docs/templates/{t.id}" class="group flex flex-1 items-center gap-3.5 bg-card px-[18px] py-4 lg:flex-col lg:items-start lg:p-6">
          <Icon name={t.icon} class="size-6 lg:size-7" />
          <div class="flex flex-col gap-0.5 lg:gap-1">
            <h3 class="font-display text-lg leading-6 font-medium group-hover:text-violet lg:text-xl lg:leading-[26px]">{t.name}</h3>
            <p class="text-sm leading-5 text-muted">{t.description}</p>
          </div>
        </a>
      </li>
    {/each}
  </ul>
</section>

<!-- Why a phone -->
<section class="flex flex-col gap-5 px-5 pb-14 lg:flex-row lg:gap-16 lg:px-16 lg:pb-28">
  <div class="flex flex-col gap-3 lg:w-[440px] lg:shrink-0 lg:gap-4">
    <h2 class={sectionTitle}>Your old phone beats a $5 server</h2>
    <p class="text-[15px] leading-[23px] text-muted lg:text-[17px] lg:leading-[26px]">
      A flagship from 2019 has more cores, memory and storage than the server most side projects rent. And it’s already paid for.
    </p>
  </div>
  <table class="w-full flex-1 table-fixed border-collapse self-start text-left">
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
        <tr>
          <th scope="row" class="border border-divider bg-card p-3.5 text-[13px] font-normal text-muted lg:px-6 lg:py-[18px] lg:text-[15px]">{label}</th>
          <td class="border border-divider bg-card p-3.5 lg:px-6 lg:py-[18px] {words ? 'text-[13px] font-medium lg:text-[15px]' : 'font-display text-lg font-medium lg:text-[22px]'}">{server}</td>
          <td class="border border-divider bg-lavender p-3.5 lg:px-6 lg:py-[18px] {words ? 'text-[13px] font-medium lg:text-[15px]' : 'font-display text-lg font-medium lg:text-[22px]'}">{phone}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<!-- Closing -->
<section class="px-5 pb-12 lg:px-16 lg:pb-20">
  <div class="flex flex-col gap-6 bg-night px-6 py-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:p-16">
    <div class="flex flex-col gap-3 lg:max-w-[620px] lg:gap-4">
      <h2 class="font-display text-4xl leading-10 font-medium tracking-[-0.035em] text-white lg:text-[56px] lg:leading-[58px]">
        There’s a server in your drawer
      </h2>
      <p class="text-[15px] leading-[23px] text-night-muted lg:text-[17px] lg:leading-[26px]">
        Install the app, pair once, and deploy. Your first URL is two minutes away.
      </p>
    </div>
    <div class="flex flex-col gap-3 lg:w-[380px] lg:shrink-0 lg:gap-3.5">
      <CopyCommand command="npx dukoi pair" size="md" tone="raised" />
      <ApkButton />
    </div>
  </div>
</section>

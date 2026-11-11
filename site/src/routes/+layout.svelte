<script lang="ts">
import './layout.css'
import Icon from '#lib/components/Icon.svelte'
import { DOCS, REPO } from '#lib/links.js'
import { page } from '$app/state'
import type { LayoutProps } from './$types'

let { children }: LayoutProps = $props()
const inDocs = $derived(page.url.pathname.startsWith('/docs'))
const description =
  'Deploy real apps to the Android phone in your drawer and get a live URL. No root, no Termux, no cloud bill.'
</script>

<svelte:head>
  <title>DroidHost: turn an old phone into a server</title>
  <meta name="description" content={description} />
  <meta property="og:title" content="DroidHost: turn an old phone into a server" />
  <meta property="og:description" content={description} />
  <meta name="theme-color" content="#f1f0f4" />
</svelte:head>

<header class="flex h-16 items-center justify-between px-5 lg:h-20 lg:px-16 {inDocs ? 'border-b border-line' : ''}">
  <a href="/" class="font-display text-[22px] font-medium tracking-[-0.02em] lg:text-2xl">DroidHost</a>
  <nav class="flex items-center gap-5 text-[15px] font-medium lg:gap-8">
    <a href={DOCS} class="hover:text-violet {inDocs ? 'text-violet' : ''}">Docs</a>
    <a href={REPO} class="flex items-center gap-2 hover:text-violet" aria-label="DroidHost on GitHub">
      <Icon name="github" class="size-[22px] lg:size-5" />
      <span class="hidden lg:inline">GitHub</span>
    </a>
  </nav>
</header>

<main>{@render children()}</main>

<footer class="flex flex-col gap-3.5 border-t border-line px-5 pt-6 pb-8 lg:flex-row lg:items-center lg:justify-between lg:px-16 lg:py-7">
  <p class="text-sm text-muted">DroidHost is free and open source.</p>
  <div class="flex gap-6 text-sm font-medium lg:gap-7">
    <a href={DOCS} class="hover:text-violet">Docs</a>
    <a href={REPO} class="hover:text-violet">GitHub</a>
  </div>
</footer>

<script lang="ts">
import './layout.css'
import Icon from '#lib/components/Icon.svelte'
import { markdownPath } from '#lib/docs.js'
import { APK, DOCS, REPO } from '#lib/links.js'
import { page } from '$app/state'
import type { LayoutProps } from './$types'

let { children }: LayoutProps = $props()
const path = $derived(page.url.pathname)
const inTemplates = $derived(path.startsWith('/docs/templates'))
const inChangelog = $derived(path.startsWith('/docs/releases'))
const inDocsSection = $derived(path.startsWith('/docs'))
const inDocs = $derived(inDocsSection && !inTemplates && !inChangelog)
const markdown = $derived(markdownPath(path))

const footer = [
  {
    title: 'Product',
    links: [
      { label: 'Templates', href: '/docs/templates' },
      { label: 'Download APK', href: APK },
      { label: 'Install the CLI', href: '/docs#pair' },
      { label: 'Changelog', href: '/docs/releases' },
    ],
  },
  {
    title: 'Docs',
    links: [
      { label: 'Get started', href: DOCS },
      { label: 'Databases', href: '/docs/databases' },
      { label: 'Custom domains', href: '/docs/custom-domains' },
      { label: 'Troubleshooting', href: '/docs/troubleshooting' },
    ],
  },
  {
    title: 'More',
    links: [
      { label: 'AI agents', href: '/docs/ai-agents' },
      { label: 'Benchmarks', href: '/bench' },
      { label: 'llms.txt', href: '/llms.txt' },
      { label: 'GitHub', href: REPO },
    ],
  },
]
const description =
  'Deploy real apps to the Android phone in your drawer and get a live URL. No root, no Termux, no cloud bill.'
</script>

<svelte:head>
  <title>Dukoi: turn an old phone into a server</title>
  <meta name="description" content={description} />
  <meta property="og:title" content="Dukoi: turn an old phone into a server" />
  <meta property="og:description" content={description} />
  <meta name="theme-color" content="#f1f0f4" />
  <link rel="alternate" type="text/markdown" href={markdown} />
</svelte:head>

<!-- Content stays within 1440px and centred; the border lines run edge to edge. -->
<div class={inDocsSection ? 'border-b border-line' : ''}>
  <header class="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 lg:h-20 lg:px-16">
    <a href="/" class="font-display text-[22px] font-medium tracking-[-0.02em] lg:text-2xl">Dukoi</a>
    <nav class="flex items-center gap-5 text-[15px] font-medium lg:gap-8">
      <a href="/docs/templates" class="hover:text-violet {inTemplates ? 'text-violet' : ''}">Templates</a>
      <a href={DOCS} class="hover:text-violet {inDocs ? 'text-violet' : ''}">Docs</a>
      <a href="/docs/releases" class="hidden hover:text-violet sm:inline {inChangelog ? 'text-violet' : ''}">Changelog</a>
      <a href={REPO} class="flex items-center gap-2 hover:text-violet" aria-label="Dukoi on GitHub">
        <Icon name="github" class="size-[22px] lg:size-5" />
        <span class="hidden lg:inline">GitHub</span>
      </a>
    </nav>
  </header>
</div>

<main class="mx-auto max-w-[1440px]">{@render children()}</main>

<div class="border-t border-line">
  <footer class="mx-auto flex max-w-[1440px] flex-col gap-8 px-5 pt-8 pb-10 lg:flex-row lg:justify-between lg:px-16 lg:pt-12 lg:pb-14">
    <p class="text-sm text-muted">Dukoi is free and open source.</p>
    <div class="grid grid-cols-2 gap-x-6 gap-y-8 text-sm sm:grid-cols-3 lg:flex lg:gap-8">
      {#each footer as column (column.title)}
        <div class="flex flex-col gap-3 lg:w-[168px]">
          <p class="text-muted">{column.title}</p>
          {#each column.links as link (link.label)}
            <a href={link.href} class="font-medium hover:text-violet">{link.label}</a>
          {/each}
        </div>
      {/each}
    </div>
  </footer>
</div>

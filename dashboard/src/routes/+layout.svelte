<script lang="ts">
import './layout.css'
import Icon from '#lib/components/Icon.svelte'
import Toast from '#lib/components/Toast.svelte'
import { liveOverview } from '#lib/phone.remote.js'
import { page } from '$app/state'
import type { LayoutProps } from './$types'

let { children }: LayoutProps = $props()
const overview = liveOverview()
const data = $derived(overview.current)

// Apps holds apps and databases, so an app's or a database's page is under it.
const tabs = [
  { href: '/', label: 'Apps' },
  { href: '/templates', label: 'Templates' },
]
const active = (href: string) =>
  href === '/templates'
    ? page.url.pathname.startsWith('/templates')
    : !page.url.pathname.startsWith('/templates') && !page.url.pathname.startsWith('/settings')
</script>

<svelte:head>
	<title>Dukoi</title>
</svelte:head>

<header class="flex h-16 items-center justify-between px-4 md:h-[72px] md:px-12">
	<div class="flex items-center gap-10">
		<a href="/" class="font-display text-[22px] font-medium tracking-[-0.02em]">Dukoi</a>
		<nav class="hidden items-center gap-1 md:flex">
			{#each tabs as tab (tab.href)}
				<a
					href={tab.href}
					aria-current={active(tab.href) ? 'page' : undefined}
					class="flex h-10 items-center px-3.5 text-sm {active(tab.href) ? 'bg-card font-semibold' : 'font-medium text-muted hover:text-ink'}"
				>
					{tab.label}
				</a>
			{/each}
		</nav>
	</div>
	<div class="flex items-center gap-3 md:gap-4">
		{#if data}
			<div class="flex h-10 items-center gap-2.5 bg-card px-3.5">
				<span class="size-[7px] rounded-full {data.problem ? 'bg-crashed' : 'bg-running'}"></span>
				<span class="text-sm font-semibold">{data.phone.name}</span>
				<span class="hidden font-mono text-[13px] text-muted sm:inline">{data.phone.host}</span>
			</div>
		{/if}
		<a
			href="/settings"
			aria-label="Settings"
			aria-current={page.url.pathname === '/settings' ? 'page' : undefined}
			class="grid size-10 place-items-center {page.url.pathname === '/settings' ? 'bg-[#ebe4fb] text-violet' : 'bg-card'}"
		>
			<Icon name="settings" size={20} />
		</a>
	</div>
</header>

<nav class="mx-4 flex gap-px bg-divider md:hidden">
	{#each tabs as tab (tab.href)}
		<a
			href={tab.href}
			aria-current={active(tab.href) ? 'page' : undefined}
			class="flex h-10 flex-1 items-center justify-center text-sm {active(tab.href) ? 'bg-card font-semibold' : 'bg-canvas font-medium text-muted'}"
		>
			{tab.label}
		</a>
	{/each}
</nav>

<main class="flex flex-col px-4 pt-4 pb-10 md:px-12 md:pt-8 md:pb-12">
	{@render children()}
</main>

<Toast />

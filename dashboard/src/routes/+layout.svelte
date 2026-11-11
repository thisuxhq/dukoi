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
</script>

<svelte:head>
	<title>Dukoi</title>
</svelte:head>

<header class="flex h-16 items-center justify-between px-4 md:h-[72px] md:px-12">
	<a href="/" class="font-display text-[22px] font-medium tracking-[-0.02em]">Dukoi</a>
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

<main class="flex flex-col px-4 pt-4 pb-10 md:px-12 md:pt-8 md:pb-12">
	{@render children()}
</main>

<Toast />

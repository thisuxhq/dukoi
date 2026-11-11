<script lang="ts">
import './layout.css'
import Toast from '#lib/components/Toast.svelte'
import { liveOverview } from '#lib/phone.remote.js'
import type { LayoutProps } from './$types'

let { children }: LayoutProps = $props()
const overview = liveOverview()
const data = $derived(overview.current)
</script>

<svelte:head>
	<title>DroidHost</title>
</svelte:head>

<header class="flex h-[72px] items-center justify-between px-12">
	<a href="/" class="font-display text-[22px] font-medium tracking-[-0.02em]">DroidHost</a>
	{#if data}
		<div class="flex items-center gap-2.5 bg-card px-3.5 py-2.5">
			<span class="size-[7px] rounded-full {data.problem ? 'bg-crashed' : 'bg-running'}"></span>
			<span class="text-sm font-semibold">{data.phone.name}</span>
			<span class="font-mono text-[13px] text-muted">{data.phone.host}</span>
		</div>
	{/if}
</header>

<main class="flex flex-col px-12 pt-8 pb-12">
	{@render children()}
</main>

<Toast />

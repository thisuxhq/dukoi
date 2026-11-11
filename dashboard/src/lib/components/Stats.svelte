<script lang="ts">
// Equal cells split by hairlines. Four cells wrap to two rows on narrow screens.
let { cells, big = false }: { cells: [value: string, label: string][]; big?: boolean } = $props()
</script>

<div class="grid gap-px bg-divider {cells.length === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}">
	{#each cells as [value, label] (label)}
		<div class="flex min-w-0 flex-col gap-0.5 bg-card {big ? 'px-4 py-3.5 md:px-5 md:py-[18px]' : 'px-4 py-3.5'}">
			<span class="truncate font-display font-medium tabular-nums {big ? 'text-2xl leading-[30px] md:text-[28px] md:leading-[34px]' : 'text-xl leading-[26px]'}">{value}</span>
			<span class="text-[13px] text-muted">{label}</span>
		</div>
	{/each}
</div>

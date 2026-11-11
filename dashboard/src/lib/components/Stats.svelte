<script lang="ts">
let { cells, big = false }: { cells: [value: string, label: string][]; big?: boolean } = $props()
</script>

<div class="flex bg-card">
	{#each cells as [value, label], i (label)}
		{#if i > 0}<div class="w-px shrink-0 bg-divider"></div>{/if}
		<div class="flex flex-1 flex-col gap-0.5 {big ? 'px-5 py-[18px]' : 'px-4 py-3.5'}">
			<span class="font-display font-medium tabular-nums {big ? 'text-[28px] leading-[34px]' : 'text-xl leading-[26px]'}">{value}</span>
			<span class="text-[13px] text-muted">{label}</span>
		</div>
	{/each}
</div>

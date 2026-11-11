<script lang="ts">
import type { Problem } from '#lib/problem.js'
import Icon from './Icon.svelte'

let { problem }: { problem: Problem } = $props()
</script>

<div role="status" class="flex gap-3 bg-soft-red px-4 py-3.5 text-crashed">
	<Icon name="alert" size={20} />
	<div class="flex flex-col gap-0.5">
		<p class="text-[15px] font-semibold">{problem.message}</p>
		{#if problem.hint}<p class="text-sm">{problem.hint}</p>{/if}
	</div>
</div>

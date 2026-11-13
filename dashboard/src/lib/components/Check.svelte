<script lang="ts">
import Icon from './Icon.svelte'

// A square tick box, drawn the same in every browser.
let { checked }: { checked: boolean } = $props()
</script>

<span
	class="grid size-5 shrink-0 place-items-center rounded {checked ? 'bg-violet text-white' : 'border-[1.5px] border-line bg-card'}"
	aria-hidden="true"
>
	{#if checked}<Icon name="tick-02" size={14} class="[&_path]:stroke-[2.5]" />{/if}
</span>

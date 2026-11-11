<script lang="ts">
import { fly } from 'svelte/transition'
import { toast } from '#lib/toast.svelte.js'
import Icon from './Icon.svelte'
</script>

{#if toast.current}
	{#key toast.current.id}
		<button
			type="button"
			onclick={() => toast.hide()}
			in:fly={{ y: -8, duration: 180 }}
			out:fly={{ y: -8, duration: 120 }}
			class="fixed top-4 left-1/2 z-10 flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-2.5 rounded bg-ink px-4 py-3.5 text-left text-[15px] text-white md:top-5"
		>
			<span class={toast.current.error ? 'text-log-error' : 'text-log-live'}>
				<Icon name={toast.current.error ? 'alert' : 'check'} size={20} />
			</span>
			{toast.current.text}
		</button>
	{/key}
{/if}

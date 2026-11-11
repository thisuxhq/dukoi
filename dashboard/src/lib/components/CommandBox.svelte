<script lang="ts">
import CopyButton from './CopyButton.svelte'

let { command }: { command: string } = $props()
</script>

<div class="flex h-11 items-center gap-4 rounded bg-night pr-1.5 pl-4 text-white">
	<code class="font-mono text-sm"><span class="text-[#7e7d8a]">$ </span>{command}</code>
	<CopyButton text={command} label="Command" />
</div>

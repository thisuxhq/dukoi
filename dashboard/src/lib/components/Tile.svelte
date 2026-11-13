<script lang="ts">
import { look } from '#lib/looks.js'
import Icon from './Icon.svelte'

// The coloured square with a template's or database's icon.
let { id, size = 40 }: { id: string; size?: number } = $props()
const l = $derived(look(id))
</script>

<span class="grid shrink-0 place-items-center" style="width:{size}px;height:{size}px;background:{l.tile};color:{l.tint}">
	<Icon name={l.icon} size={Math.round(size / 2)} />
</span>

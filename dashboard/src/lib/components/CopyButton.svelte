<script lang="ts">
import { toast } from '#lib/toast.svelte.js'
import Icon from './Icon.svelte'

let {
  text,
  label,
  class: className = '',
}: { text: string; label: string; class?: string } = $props()

async function copy() {
  await navigator.clipboard.writeText(text)
  toast.show(`${label} copied`)
}
</script>

<button type="button" onclick={copy} aria-label="Copy {label.toLowerCase()}" class="grid size-8 place-items-center {className}">
	<Icon name="copy" />
</button>

<script lang="ts">
import type { AppState } from '@dukoi/shared'

let { state, big = false }: { state: AppState; big?: boolean } = $props()

const colors: Record<AppState, string> = {
  running: 'bg-running',
  starting: 'bg-restarting animate-pulse',
  restarting: 'bg-restarting animate-pulse',
  crashed: 'bg-crashed',
  stopped: 'bg-muted',
}
</script>

<span class="flex items-center gap-1.5 font-medium {big ? 'text-[15px]' : 'text-sm'} {state === 'crashed' ? 'text-crashed' : ''}">
	<span class="rounded-full {big ? 'size-2' : 'size-[7px]'} {colors[state]}"></span>
	{state[0]?.toUpperCase()}{state.slice(1)}
</span>

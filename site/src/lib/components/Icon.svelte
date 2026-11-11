<script lang="ts" module>
// Hugeicons solid-rounded, copied into src/lib/icons. They use currentColor, so CSS color sets them.
const files = import.meta.glob('../icons/*.svg', { query: '?raw', import: 'default', eager: true })
const icons: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, svg]) => [
    path.replace(/^.*\/(.+)\.svg$/, '$1'),
    (svg as string).replace(/width="24" height="24"/, 'width="100%" height="100%"'),
  ]),
)
</script>

<script lang="ts">
let { name, class: className = 'size-6' }: { name: string; class?: string } = $props()
</script>

<span class="inline-block shrink-0 {className}" aria-hidden="true">{@html icons[name]}</span>

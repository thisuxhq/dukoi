<script lang="ts">
// Label and value rows, like the requirements on the quick start.
let { rows }: { rows: [label: string, value: string][] } = $props()
</script>

<dl class="flex flex-col gap-px bg-divider">
  {#each rows as [label, value] (label)}
    <div class="flex justify-between gap-6 bg-card px-4 py-3.5 text-[15px] leading-5 lg:px-5">
      <dt class="text-muted">{label}</dt>
      <dd class="text-right font-medium">{value}</dd>
    </div>
  {/each}
</dl>

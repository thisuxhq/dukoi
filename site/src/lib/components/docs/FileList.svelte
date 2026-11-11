<script lang="ts">
// A template's files. The one to edit is highlighted in lavender.
let { files }: { files: { name: string; about: string; edit?: boolean }[] } = $props()
</script>

<dl class="flex flex-col gap-px bg-divider">
  {#each files as file (file.name)}
    <div class="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-6 lg:px-5 {file.edit ? 'bg-lavender' : 'bg-card'}">
      <dt class="font-mono text-sm leading-5 sm:w-40 sm:shrink-0 {file.edit ? 'font-semibold text-violet' : ''}">{file.name}</dt>
      <dd class="text-[15px] leading-[22px] {file.edit ? 'text-ink' : 'text-body'}">{file.about}</dd>
    </div>
  {/each}
</dl>

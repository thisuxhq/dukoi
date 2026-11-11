<script lang="ts">
// A block of code or a file's contents, on white. Passed as a string so whitespace survives.
let { code }: { code: string } = $props()
</script>

<pre class="overflow-x-auto bg-card px-5 py-4 font-mono text-sm leading-6">{code}</pre>

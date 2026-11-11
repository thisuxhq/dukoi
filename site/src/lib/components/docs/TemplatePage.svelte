<script lang="ts">
import type { Snippet } from 'svelte'
import { template } from '#lib/templates.js'
import Icon from '../Icon.svelte'
import Header from './Header.svelte'
import Section from './Section.svelte'
import Terminal from './Terminal.svelte'

// A template's page: what it is, how to get it, then the page's own sections.
let { id, lead, children }: { id: string; lead: string; children: Snippet } = $props()
const t = $derived(template(id))
</script>

<span class="mb-4 grid size-[52px] place-items-center {t.tint}"><Icon name={t.icon} class="size-[26px] {t.ink}" /></span>
<Header title={t.name} {lead} />

<Section id="get-it" title="Get it">
  <Terminal command="npx droidhost init {t.id}" />
  <p>
    It makes a <code>{t.id}</code> folder and deploys it. On the phone instead: <strong>Try a template → {t.name} → Deploy</strong>.
  </p>
</Section>

{@render children()}

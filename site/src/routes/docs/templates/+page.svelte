<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Section from '#lib/components/docs/Section.svelte'
import TemplateCard from '#lib/components/docs/TemplateCard.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'
import { templates } from '#lib/templates.js'
</script>

<Header
  title="Templates"
  lead="Pick one and it’s live on your phone in under a minute. Then change one file and deploy again to make it yours."
/>

<Section id="pick-one" title="Pick one">
  <div class="grid gap-3 md:grid-cols-2">
    {#each templates as t, i (t.id)}
      <TemplateCard template={t} wide={i === templates.length - 1} />
    {/each}
  </div>
</Section>

<Section id="from-your-computer" title="Start from your computer">
  <p>Run <code>init</code> on its own to choose from a list. It makes the folder and deploys it straight away.</p>
  <Terminal
    command="npx droidhost init"
    output={`
Pick a template:
  1  static-site    A one-page site with your name on it
  2  notes-api      A small JSON API with a database
  3  file-drop      Upload a file, get a link to share
  4  mcp-server     A tool your AI assistant can call
  5  telegram-bot   A bot that replies, always on
Number (1-5): 2
✓ Created notes-api/
✓ Installed dependencies
✓ Packed notes-api (1.9 MB)
✓ Uploaded to a024
✓ Started and healthy (release 0001)

  Local   http://192.168.0.112:3000

  Make it yours: edit notes-api/server.js, then run droidhost deploy`}
  />
  <p>Or name one to skip the list: <code>npx droidhost init notes-api</code>. If this computer isn’t paired yet, <code>init</code> only makes the folder and tells you to pair first.</p>
</Section>

<Section id="from-the-phone" title="Start from the phone">
  <p>
    No computer yet? Open DroidHost, tap a template under <strong>Try a template</strong>, then <strong>Deploy</strong>. When you want to change it, the app shows the <code>init</code> command to run on your computer. Your next deploy replaces the demo.
  </p>
</Section>

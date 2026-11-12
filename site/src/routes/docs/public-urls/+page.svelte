<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'

const kinds: [string, string, string][] = [
  ['Local URL', 'http://192.168.0.112:3000', 'Your Wi-Fi only'],
  ['Quick link', 'https://shy-river-42.trycloudflare.com', 'Anywhere, but it can change'],
  ['Your domain', 'https://api.example.com', 'Anywhere, and it never changes'],
]
</script>

<Header
  title="Public URLs"
  lead="Every app gets a Wi-Fi URL when it deploys. One command adds a public HTTPS URL, with no port forwarding or router setup."
/>

<Section id="kinds" title="Three kinds of URL">
  <dl class="flex flex-col gap-px bg-divider">
    {#each kinds as [kind, url, reach] (kind)}
      <div class="flex flex-col gap-1 bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:gap-6 lg:px-5">
        <dt class="text-[15px] font-medium sm:w-28 sm:shrink-0">{kind}</dt>
        <dd class="min-w-0 flex-1 truncate font-mono text-[13px] text-violet">{url}</dd>
        <dd class="text-sm text-muted sm:w-52 sm:shrink-0 sm:text-right">{reach}</dd>
      </div>
    {/each}
  </dl>
</Section>

<Section id="quick-link" title="Get a quick link">
  <Terminal
    command="dukoi expose"
    output={`
Asking Cloudflare for a public URL…
✓ hono-api is public

  Public  https://shy-river-42.trycloudflare.com`}
  />
  <p>It takes a few seconds and needs no account. The phone opens an outbound tunnel to Cloudflare, so it works behind CGNAT and home routers that block incoming connections.</p>
  <p>Quick links are good for demos, testing and webhooks you can update. The URL stays the same if the Dukoi agent restarts. It changes if the tunnel itself restarts, for example after the phone reboots, and <code>dukoi ps</code> always shows the current one.</p>
</Section>

<Section id="off" title="Turn it off">
  <Terminal command="dukoi expose --off" />
  <p>The app goes back to Wi-Fi only. You can also change it on the phone: open the app and tap the edit icon next to its public link.</p>
</Section>

<Note title="Want a URL that never changes?" icon="globe-02">
  Put the app on your own domain. See <a href="/docs/custom-domains">Custom domains</a>.
</Note>

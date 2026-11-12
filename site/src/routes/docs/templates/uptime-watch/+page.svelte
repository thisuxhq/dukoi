<script lang="ts">
import Browser from '#lib/components/docs/Browser.svelte'
import Code from '#lib/components/docs/Code.svelte'
import FileList from '#lib/components/docs/FileList.svelte'
import Section from '#lib/components/docs/Section.svelte'
import TemplatePage from '#lib/components/docs/TemplatePage.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'

// The last 30 checks per site: true is up.
const sites = [
  {
    name: 'Shop',
    url: 'https://shop.example.com',
    state: 'Down 3 min',
    checks: Array.from({ length: 30 }, (_, i) => i < 27),
  },
  {
    name: 'Blog',
    url: 'https://blog.example.com',
    state: '142 ms',
    checks: Array.from({ length: 30 }, () => true),
  },
  {
    name: 'Home router',
    url: 'http://192.168.1.1',
    state: '8 ms',
    checks: Array.from({ length: 30 }, (_, i) => i !== 11),
  },
]

const change = `export const sites = [
  { name: 'Shop', url: 'https://shop.example.com' },
  { name: 'Home router', url: 'http://192.168.1.1' },
]`
</script>

<TemplatePage
  id="uptime-watch"
  lead="Your sites checked every minute from your phone, and a push notification when one goes down and when it’s back."
>
  <Section id="what-you-get" title="What you get">
    <p>A page with the last 30 checks for each site. A site counts as down after two failed checks in a row, so one slow answer doesn’t wake you.</p>
    <Browser url="192.168.0.112:3006">
      <ul class="flex flex-col gap-px bg-divider">
        {#each sites as site (site.name)}
          <li class="flex items-center gap-5 bg-card px-5 py-3.5">
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="font-medium text-ink">{site.name}</span>
              <span class="truncate font-mono text-[13px] text-muted">{site.url}</span>
            </div>
            <span class="hidden gap-0.5 sm:flex" aria-hidden="true">
              {#each site.checks as ok, i (i)}<i class="h-6 w-1 {ok ? 'bg-running' : 'bg-pink'}"></i>{/each}
            </span>
            <span class="w-24 text-right text-sm {site.state.startsWith('Down') ? 'font-semibold text-pink' : 'text-muted'}">{site.state}</span>
          </li>
        {/each}
      </ul>
    </Browser>
    <p>Alerts go through <a href="https://ntfy.sh">ntfy</a>, a free push app for Android and iOS with no account. The page shows a topic; subscribe to it in the app. To pick your own topic:</p>
    <Terminal command="dukoi env set NTFY_TOPIC=my-long-hard-to-guess-topic" />
  </Section>

  <Section id="make-it-yours" title="Make it yours">
    <p>Five files. You only need to touch one.</p>
    <FileList
      files={[
        { name: 'sites.js', about: 'The sites to watch. Edit this one.', edit: true },
        { name: 'server.js', about: 'Checks, alerts and the page' },
        { name: 'public/index.html', about: 'The status page' },
        { name: 'package.json', about: 'Its name and packages' },
        { name: 'README.md', about: 'How to run it, in five minutes' },
      ]}
    />
    <p>Put your own sites in <code>sites.js</code>. Addresses on your Wi-Fi work too, which a server in the cloud can’t check:</p>
    <Code code={change} />
    <Terminal command="dukoi deploy" />
  </Section>
</TemplatePage>

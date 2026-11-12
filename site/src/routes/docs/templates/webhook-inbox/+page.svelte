<script lang="ts">
import Browser from '#lib/components/docs/Browser.svelte'
import Code from '#lib/components/docs/Code.svelte'
import FileList from '#lib/components/docs/FileList.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import TemplatePage from '#lib/components/docs/TemplatePage.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'

const requests = [
  ['POST', '/hook/stripe', 'just now'],
  ['POST', '/hook/github', '4 min ago'],
  ['GET', '/hook?ping=1', '12 min ago'],
]

const change = `export async function handle({ headers, body }) {
  if (headers['x-github-event'] === 'push') {
    const push = JSON.parse(body)
    console.log(\`\${push.pusher.name} pushed to \${push.repository.full_name}\`)
  }
}`
</script>

<TemplatePage
  id="webhook-inbox"
  lead="An address to send webhooks to, and a page that shows each one as it arrives, headers and body. Test Stripe, GitHub or Shopify hooks without a paid tool."
>
  <Section id="what-you-get" title="What you get">
    <p>Every request to <code>/hook</code>, or anything under it, is saved on the phone and shows up on the page within two seconds. The newest one opens by itself.</p>
    <Browser url="quiet-river-kite.trycloudflare.com">
      <ul class="flex flex-col gap-px bg-divider">
        {#each requests as [method, path, when] (path)}
          <li class="flex items-center gap-4 bg-card px-5 py-3.5 font-mono text-[13px]">
            <span class="w-12 shrink-0 font-semibold text-violet">{method}</span>
            <span class="flex-1 text-ink">{path}</span>
            <span class="font-sans text-muted">{when}</span>
          </li>
        {/each}
      </ul>
    </Browser>
    <p>Services on the internet can’t reach your Wi-Fi, so give the app a <a href="/docs/public-urls">public URL</a> and paste that, plus <code>/hook</code>, into the service’s webhook settings.</p>
    <Terminal command="dukoi expose" />
  </Section>

  <Section id="make-it-yours" title="Make it yours">
    <p>Five files. You only need to touch one.</p>
    <FileList
      files={[
        { name: 'handle.js', about: 'What to do with each webhook. Edit this one.', edit: true },
        { name: 'server.js', about: 'Saves requests and serves the page' },
        { name: 'public/index.html', about: 'The inbox page' },
        { name: 'package.json', about: 'Its name and packages' },
        { name: 'README.md', about: 'How to run it, in five minutes' },
      ]}
    />
    <p>Act on GitHub pushes in <code>handle.js</code>. What it returns is the reply:</p>
    <Code code={change} />
    <Terminal command="dukoi deploy" />
    <Note title="The page shows headers" tone="warning">
      Some services put secrets in headers. Don’t share the URL, or add a password check in <code>server.js</code>.
    </Note>
  </Section>
</TemplatePage>

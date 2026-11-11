<script lang="ts">
import Browser from '#lib/components/docs/Browser.svelte'
import Code from '#lib/components/docs/Code.svelte'
import FileList from '#lib/components/docs/FileList.svelte'
import Section from '#lib/components/docs/Section.svelte'
import TemplatePage from '#lib/components/docs/TemplatePage.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'

const response = `{
  "name": "notes-api",
  "routes": {
    "GET /notes": "List notes",
    "POST /notes": "Add a note",
    "DELETE /notes/:id": "Remove a note"
  }
}`

const change = `// Count the notes
app.get('/notes/count', (c) =>
  c.json(db.prepare('SELECT count(*) AS n FROM notes').get()),
)`
</script>

<TemplatePage
  id="notes-api"
  lead="A small JSON API with a database, built with Hono. Start here for any backend: add your routes next to the notes ones."
>
  <Section id="what-you-get" title="What you get">
    <p>Open the URL and the API tells you what it can do. Notes are saved in <code>DATA_DIR</code>, so they survive deploys and rollbacks.</p>
    <Browser url="192.168.0.112:3000">
      <pre class="overflow-x-auto px-[22px] py-5 font-mono text-sm leading-6">{response}</pre>
    </Browser>
  </Section>

  <Section id="make-it-yours" title="Make it yours">
    <p>Three files. You only need to touch one.</p>
    <FileList
      files={[
        { name: 'server.js', about: 'The routes. Edit this one.', edit: true },
        { name: 'package.json', about: 'Its name and packages' },
        { name: 'README.md', about: 'How to run it, in five minutes' },
      ]}
    />
    <p>Add a route to <code>server.js</code>:</p>
    <Code code={change} />
    <p>Then deploy again. It’s live in seconds, and your notes are still there.</p>
    <Terminal command="npx dukoi deploy" />
  </Section>
</TemplatePage>

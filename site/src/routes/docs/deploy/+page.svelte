<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'

const config = `{
  "name": "my-api",
  "start": "node dist/server.js",
  "healthCheck": "/health",
  "ignore": ["fixtures"]
}`
</script>

<Header
  title="Deploy an app"
  lead="Run deploy in your app’s folder. Dukoi works out what the app is and how to start it, so most apps need no config at all."
/>

<Section id="deploy" title="Deploy">
  <Terminal
    command="dukoi deploy"
    output={`
✓ Built on this computer
✓ Installed dependencies
✓ Packed hono-api (2.4 MB)
✓ Uploaded to a024
✓ Started and healthy (release 0004)

  Local    http://192.168.0.112:3000

  Logs     dukoi logs hono-api
  Public   dukoi expose hono-api

  Done in 9.8s`}
  />
  <p>Pass a folder to deploy from somewhere else: <code>dukoi deploy starters/hono-api</code>.</p>
</Section>

<Section id="what-runs" title="What runs">
  <ul class="list">
    <li><strong>Node apps.</strong> A folder with <code>package.json</code>. Dukoi runs <code>scripts.start</code>, or else <code>main</code>, <code>index.js</code>, <code>server.js</code> or <code>src/index.js</code>.</li>
    <li><strong>Static sites.</strong> A folder with <code>index.html</code> and no <code>package.json</code>. Dukoi serves it.</li>
  </ul>
  <p>The phone runs Node 24 directly, so <code>scripts.start</code> must be <code>node &lt;file&gt;.js</code>. Build TypeScript first: if there’s a <code>build</code> script, deploy runs it on your computer before uploading.</p>
</Section>

<Section id="your-app" title="What your app needs">
  <p>Listen on the port in <code>PORT</code>. Dukoi checks that the app answers there within 10 seconds before it switches traffic over.</p>
  <ul class="list">
    <li><code>PORT</code> and <code>HOST</code>: where to listen.</li>
    <li><code>DATA_DIR</code>: a folder that survives deploys and rollbacks. Keep databases and uploads here.</li>
    <li><code>NODE_ENV</code> is <code>production</code>.</li>
  </ul>
  <p>Bots and workers that open no port can skip the check with <code>--no-health-check</code>. They count as healthy if they’re still running after 3 seconds.</p>
</Section>

<Section id="packing" title="What gets uploaded">
  <p>Deploy copies the folder, installs production dependencies <strong>on your computer</strong> and uploads the lot, so the phone never runs npm. It always leaves out <code>.git</code>, <code>node_modules</code>, <code>.env</code> and <code>.env.local</code>.</p>
  <Note title="Native modules don’t run on phones yet" tone="warning">
    Packages with compiled code, like <code>sharp</code> or <code>bcrypt</code>, stop the deploy with a pure JavaScript swap to try: <code>bcryptjs</code> for <code>bcrypt</code>, <code>node:sqlite</code> for <code>better-sqlite3</code>.
  </Note>
</Section>

<Section id="config" title="Change a guess">
  <p>You don’t need a config file. Add <code>dukoi.json</code> only to change what Dukoi worked out. Every field is optional, and <code>"healthCheck": false</code> turns the check off.</p>
  <pre class="overflow-x-auto bg-card px-5 py-4 font-mono text-sm leading-6">{config}</pre>
  <p>The name comes from <code>--name</code>, then <code>dukoi.json</code>, then <code>package.json</code>, then the folder name.</p>
</Section>

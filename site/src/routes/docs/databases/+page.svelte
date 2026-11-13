<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'
</script>

<Header
  title="Databases"
  lead="Run Redis or Postgres on the phone, next to your apps. Your apps get the connection URL by themselves."
/>

<Section id="create" title="Make one">
  <p>In the dashboard, open <strong>Templates</strong>, pick <strong>Redis</strong> or <strong>Postgres</strong>, tick the apps that need it and click <strong>Create</strong>. Or from your computer:</p>
  <Terminal
    command="dukoi db create redis --app my-api"
    output={`
Starting Redis on pixel-10a…
✓ redis is running on port 6380
  my-api got REDIS_URL and restarted.`}
  />
  <p>Your app reads <code>process.env.REDIS_URL</code>, or <code>process.env.DATABASE_URL</code> for Postgres. Use a JavaScript client, like <code>redis</code> or <code>ioredis</code>, and <code>pg</code> or <code>postgres</code>.</p>
  <pre class="overflow-x-auto bg-card px-5 py-4 font-mono text-sm leading-6">{`import { createClient } from 'redis'

const redis = createClient({ url: process.env.REDIS_URL })
await redis.connect()
await redis.incr('visits')`}</pre>
</Section>

<Section id="kinds" title="What runs">
  <ul class="list">
    <li><strong>Redis</strong> is <a href="https://valkey.io">Valkey</a> 9.1, the open-source Redis. Every Redis client and command works. It uses about 10 MB of memory to start.</li>
    <li><strong>Postgres</strong> is <a href="https://pglite.dev">PGlite</a>, real Postgres 18 that runs on the phone’s Node. Several connections work, and queries run one at a time, so it suits small apps. It uses about 400 MB of memory, so check your phone has room.</li>
  </ul>
  <p>Data is saved on the phone, so it survives restarts, reboots and deploys.</p>
</Section>

<Section id="apps" title="Connect and disconnect apps">
  <Terminal command="dukoi db connect redis worker" output="✓ worker got REDIS_URL and restarted" />
  <p>Connecting sets the app’s <code>REDIS_URL</code> or <code>DATABASE_URL</code> setting and restarts it once. <code>dukoi db disconnect redis worker</code> takes it away. Several apps can share one database.</p>
</Section>

<Section id="wifi" title="Use it from your computer">
  <p>A database is for the phone’s apps until you turn on Wi-Fi access. Then devices on your Wi-Fi can connect, with the same password:</p>
  <Terminal command="dukoi db wifi postgres" output={`✓ postgres is reachable on your Wi-Fi
  URL: dukoi db url postgres --wifi`} />
  <Terminal command={'psql "$(dukoi db url postgres --wifi)"'} />
  <p>In the dashboard, it’s the <strong>Also reachable on Wi-Fi</strong> box on the database’s page. Databases never get a public link.</p>
  <Note title="Use a network you trust">
    The password crosses your Wi-Fi in plain text, like it does for any Redis or Postgres without TLS. Turn Wi-Fi access off with <code>dukoi db wifi postgres --off</code> when you’re done.
  </Note>
</Section>

<Section id="passwords" title="Passwords">
  <p>Every database has its own password, already in its URL. Dukoi shows URLs with the password hidden. <code>dukoi db url redis</code> and the copy buttons give you the full one.</p>
  <p><code>dukoi db password redis</code> makes a new one. Connected apps get the new URL and restart, and the old password stops working at once.</p>
</Section>

<Section id="more" title="Everything else">
  <ul class="list">
    <li><code>dukoi db</code> lists your databases. <code>dukoi db logs redis</code> shows a database’s log.</li>
    <li><code>dukoi db stop</code>, <code>start</code> and <code>restart</code> work like they do for apps.</li>
    <li><code>dukoi db remove redis</code> deletes the database and its data, and takes its URL from your apps. It asks first.</li>
  </ul>
</Section>

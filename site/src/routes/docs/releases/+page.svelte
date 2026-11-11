<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'
</script>

<Header
  title="Releases and rollback"
  lead="Every deploy is a release. The phone keeps the last five, so a bad deploy is one command from gone."
/>

<Section id="zero-downtime" title="Deploys without downtime">
  <p>A new release starts next to the old one. Traffic moves over only once the new one answers, and then the old one stops. If the new one never answers, the old one keeps running and deploy tells you why.</p>
</Section>

<Section id="list" title="See releases">
  <Terminal
    command="npx dukoi releases"
    output={`
   RELEASE  CREATED              SIZE
●  0004     2026-11-11 09:41:07  2412 KB
   0003     2026-11-10 18:02:55  2398 KB
   0002     2026-11-10 11:20:13  2398 KB
   0001     2026-11-09 21:44:30  48 KB`}
  />
  <p>The dot marks the live one.</p>
</Section>

<Section id="rollback" title="Roll back">
  <Terminal
    command="npx dukoi rollback"
    output={`
✓ hono-api is back on release 0003 (1.1s)`}
  />
  <p>That goes back one release, in about a second. To pick another, use <code>--to 0002</code>. You can also tap <strong>Roll back</strong> next to a release in the dashboard.</p>
  <Note title="Your data stays put">
    <code>DATA_DIR</code> lives outside releases, so rolling back doesn’t touch it. If a release changed your database, rolling back the code won’t undo that.
  </Note>
</Section>

<Section id="control" title="Start, stop and remove">
  <ul class="list">
    <li><code>dukoi restart</code> restarts the app.</li>
    <li><code>dukoi stop</code> stops it, and it stays stopped after a reboot. <code>dukoi start</code> brings it back.</li>
    <li><code>dukoi remove</code> deletes the app with its releases, data and logs. It asks first, and <code>--yes</code> skips the question.</li>
  </ul>
  <p>Each one acts on the app in the current folder, or name one: <code>dukoi restart hono-api</code>.</p>
</Section>

<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'
</script>

<Header
  title="Dashboard"
  lead="Every app on the phone, its status and its live logs, in your browser. It runs on your computer, so only your computer can open it."
/>

<Section id="open" title="Open it">
  <Terminal
    command="npx droidhost dashboard"
    output={`
Dashboard for a024: http://127.0.0.1:7071
Only this computer can open it. Press Ctrl+C to stop.`}
  />
  <p>Your browser opens on its own. <code>--no-open</code> skips that. If port 7071 is busy, it takes the next free one.</p>
</Section>

<Section id="what-you-get" title="What you can do">
  <ul class="list">
    <li>See every app with its status and public link.</li>
    <li>Open an app for its live logs, its releases and its URLs.</li>
    <li><strong>Restart</strong> an app, or <strong>Roll back</strong> to any release it still has.</li>
    <li>In <strong>Settings</strong>, check the phone’s details and storage, disconnect it from Cloudflare, stop every app or unpair this computer.</li>
  </ul>
</Section>

<Section id="safety" title="Why it’s safe">
  <p>The dashboard listens on <code>127.0.0.1</code>, so other devices on your network can’t reach it. It talks to the phone with this computer’s pairing key, like the CLI does, and the key never reaches the browser.</p>
  <Note title="More than one phone?">
    The dashboard shows the last phone you used. Pick another with <code>droidhost dashboard --device pixel-6</code>.
  </Note>
</Section>

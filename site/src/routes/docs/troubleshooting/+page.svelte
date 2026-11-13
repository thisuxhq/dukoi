<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Section from '#lib/components/docs/Section.svelte'
</script>

<Header
  title="Troubleshooting"
  lead="Every error says what happened and what to do next. Here are the ones you’re most likely to see, with the fix."
/>

<Section id="no-phone" title="“No Dukoi phone found on this Wi-Fi or your tailnet”">
  <p>Open Dukoi on the phone and check both are on the same Wi-Fi, or both signed in to Tailscale. Guest networks and some mesh routers stop devices finding each other. Pass the phone’s address instead: <code>dukoi pair --host 192.168.0.112</code>.</p>
</Section>

<Section id="unreachable" title="“Couldn’t find a024 on this Wi-Fi”">
  <p>When the phone’s address changes, <code>dukoi</code> looks for it on this Wi-Fi and on your tailnet by itself. This error means it looked and the phone didn’t answer. Check the phone is on and Dukoi is running. If the message says Tailscale is off, turn it on on the computer; if it says the phone is offline on Tailscale, open Tailscale on the phone. Away from home without Tailscale, see <a href="/docs/pairing#away-from-home">Use it away from home</a>.</p>
</Section>

<Section id="health-timeout" title="“Your app started but didn’t answer on PORT”">
  <p>Dukoi waits 10 seconds for your app to answer on <code>PORT</code>. Check that it listens on <code>process.env.PORT</code>, not a fixed port, and read <code>dukoi logs</code> for errors. If it’s a bot or worker with no port, deploy with <code>--no-health-check</code>. The old release keeps running until a new one is healthy.</p>
</Section>

<Section id="start-script" title="“Your start script runs …, but the phone can only run Node directly”">
  <p>The phone runs <code>node</code>, not <code>tsx</code>, <code>bun</code> or <code>npm</code>. Add a <code>build</code> script that compiles your app, and make <code>scripts.start</code> <code>node dist/server.js</code>. Deploy runs the build on your computer first.</p>
</Section>

<Section id="native" title="“… uses native code, which phones can’t run yet”">
  <p>Swap the package for a pure JavaScript one. The error suggests one: <code>bcryptjs</code> for <code>bcrypt</code>, <code>node:sqlite</code> for <code>better-sqlite3</code>, <code>jimp</code> for <code>sharp</code>.</p>
</Section>

<Section id="killed" title="Apps keep restarting">
  <p>Run <code>dukoi ps</code>. It says why each app last stopped. If Android is stopping it, open Dukoi on the phone and finish any setup step that isn’t green, especially the steps for your phone’s brand. See <a href="/docs/phone-setup">Set up the phone</a>.</p>
</Section>

<Section id="quick-link-changed" title="My quick link changed">
  <p>Quick links change whenever the tunnel restarts. <code>dukoi ps</code> shows the current one. For a URL that never changes, use <a href="/docs/custom-domains">your own domain</a>.</p>
</Section>

<Section id="quota" title="Cloudflare says “Quota limit exceeded”">
  <p>Cloudflare allows 50 API tokens per account, and each login adds one. Delete the ones you don’t use at <strong>dash.cloudflare.com → My Profile → API Tokens</strong>, then run the command again.</p>
</Section>

<Section id="help" title="Still stuck?">
  <p>Open an issue on <a href="https://github.com/thisuxhq/dukoi/issues">GitHub</a> with the command you ran and what it printed. Add <code>--json</code> to get the error code.</p>
</Section>

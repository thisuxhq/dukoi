<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'
</script>

<Header
  title="Custom domains"
  lead="Put an app on a name like api.example.com. It stays the same across restarts, reboots and reinstalls."
/>

<Section id="before" title="What you need">
  <p>A domain on Cloudflare. The free plan is fine.</p>
</Section>

<Section id="add" title="Add a domain">
  <Terminal
    command="npx droidhost expose --domain api.example.com"
    output={`
Pointing api.example.com at hono-api…

Connect the phone to Cloudflare. In the page that opens, pick example.com and click Authorize.

✓ Phone connected to example.com
Pointing api.example.com at hono-api…
✓ hono-api is public

  Public  https://api.example.com

  This URL stays the same across restarts and reboots.`}
  />
  <ol class="list">
    <li>The first time, Cloudflare’s login opens in your browser. Pick your domain and click <strong>Authorize</strong>. The phone keeps the certificate.</li>
    <li>The phone makes one tunnel for itself and a DNS record for the name.</li>
    <li>After that, adding another name under the same domain takes a second.</li>
  </ol>
  <p>You can do the same on the phone: open the app, tap <strong>Make public</strong> and pick <strong>Your domain</strong>.</p>
</Section>

<Section id="rules" title="Good to know">
  <ul class="list">
    <li>Every name must be under the domain you picked at login, like <code>*.example.com</code>.</li>
    <li>A domain replaces the app’s quick link.</li>
    <li>DroidHost only changes DNS records it made, and won’t take over a name that already points somewhere else.</li>
    <li><code>droidhost expose --off</code> removes the name and its DNS record.</li>
  </ul>
</Section>

<Section id="disconnect" title="Disconnect from Cloudflare">
  <p>On the phone, go to <strong>Settings → Cloudflare → Disconnect</strong>. Every app loses its domain, DroidHost deletes the DNS records and tunnel it made, and the phone deletes its certificate. Add a domain again to log in fresh, or to switch to another domain.</p>
  <Note title="One thing to tidy up">
    The login’s API token stays in your Cloudflare account, because a token can’t delete itself. Remove it at <strong>dash.cloudflare.com → My Profile → API Tokens</strong>.
  </Note>
</Section>

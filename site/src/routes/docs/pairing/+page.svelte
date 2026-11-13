<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'
</script>

<Header
  title="Pair a computer"
  lead="Pairing links your computer to the phone with a key, once. There are no passwords, and only paired computers can deploy."
/>

<Section id="pair" title="Pair">
  <p>Open Dukoi on the phone, then run this on a computer on the same Wi-Fi:</p>
  <Terminal
    command="dukoi pair"
    output={`
Looking for phones on this Wi-Fi and your tailnet…
✓ Found a024 (Nothing A024, Android 16) at 192.168.0.112

  Code on your phone: 482 913
  Tap Approve on the phone if the codes match.

✓ Paired with a024

  Next: dukoi deploy in your app's folder`}
  />
  <p>Check that the code on the phone matches the one in your terminal, then tap <strong>Approve</strong>. The matching code proves you’re talking to your phone and nobody else’s. If nobody approves within 2 minutes, run <code>pair</code> again.</p>
</Section>

<Section id="no-phone-found" title="If it can’t find the phone">
  <p>Check Dukoi is open on the phone and both are on the same Wi-Fi, or both signed in to Tailscale. Some routers block devices from finding each other. If yours does, pass the phone’s address. You’ll find it in the app.</p>
  <Terminal command="dukoi pair --host 192.168.0.112" />
</Section>

<Section id="away-from-home" title="Use it away from home">
  <p>Install <a href="https://tailscale.com">Tailscale</a> on the phone and the computer and sign in to the same account. That’s it: <code>dukoi</code> finds the phone on your tailnet whenever it isn’t on your Wi-Fi, and switches back when it is. The free Personal plan is enough.</p>
  <p>On the phone, turn on <strong>Always-on VPN</strong> for Tailscale (Settings, Network, VPN) and take it out of battery optimisation, so Android doesn’t stop it.</p>
  <p>App URLs follow too. On Tailscale, <code>dukoi deploy</code> prints an address like <code>http://100.74.25.113:3000</code> that opens from your computer.</p>
</Section>

<Section id="more-phones" title="More than one phone">
  <p>Pair each phone the same way. Commands use the last phone you used, and <code>--device</code> picks another.</p>
  <Terminal
    command="dukoi devices"
    output={`
   NAME       MODEL           ADDRESS              PAIRED
●  a024       Nothing A024    192.168.0.112:7070   2026-11-11
   pixel-6    Pixel 6         192.168.0.140:7070   2026-11-10`}
  />
  <p>To name a phone yourself, pair with <code>--name kitchen</code>.</p>
</Section>

<Section id="unpair" title="Unpair">
  <p><code>dukoi unpair a024</code> forgets the phone on this computer and asks the phone to forget the computer too.</p>
  <Note title="Lost a laptop?">
    Remove the computer in the Dukoi app on the phone. It can’t deploy or read logs after that.
  </Note>
</Section>

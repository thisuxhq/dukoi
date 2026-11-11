<script lang="ts">
import ApkButton from '#lib/components/ApkButton.svelte'
import Facts from '#lib/components/docs/Facts.svelte'
import Header from '#lib/components/docs/Header.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'
</script>

<Header
  title="Quick start"
  lead="Go from a phone in a drawer to a live URL in about two minutes. You need a spare Android phone and a computer on the same Wi-Fi."
/>

<Section id="install" step={1} title="Install the app on the phone">
  <p>
    Download the APK and open it on the phone. The app walks you through four setup steps that stop Android from killing your apps. Tap through them once.
  </p>
  <Facts
    rows={[
      ['Android', '10 or newer'],
      ['Processor', '64-bit ARM (most phones since 2017)'],
      ['Root', 'Not needed'],
    ]}
  />
  <ApkButton size="md" class="w-fit" />
</Section>

<Section id="pair" step={2} title="Pair your computer">
  <p>
    On your computer, on the same Wi-Fi, run this. It finds the phone and shows a six-digit code. Check it matches the phone, then tap <strong>Approve</strong>.
  </p>
  <Terminal
    command="npx droidhost pair"
    output={`
✓ Found a024 (Nothing A024, Android 16) at 192.168.0.112

  Code on your phone: 482 913
  Tap Approve on the phone if the codes match.

✓ Paired with a024`}
  />
</Section>

<Section id="deploy" step={3} title="Deploy your app">
  <p>
    In your app’s folder, run deploy. DroidHost packs the folder, ships it to the phone, starts it and waits until it answers.
  </p>
  <Terminal
    command="npx droidhost deploy"
    output={`
✓ Packed hono-api (48 KB)
✓ Uploaded to a024
✓ Started and healthy (release 0001)

  Local    http://192.168.0.112:3000

  Logs     droidhost logs hono-api
  Public   droidhost expose hono-api

  Done in 6.2s`}
  />
</Section>

<p class="pb-6">No app yet? Start from a <a href="/docs/templates">template</a>.</p>

<Note title="Want a public URL?" icon="globe-02">
  Run <code>npx droidhost expose</code> for a quick link, or add <code>--domain api.example.com</code> to use your own domain. See <a href="/docs/public-urls">Public URLs</a>.
</Note>

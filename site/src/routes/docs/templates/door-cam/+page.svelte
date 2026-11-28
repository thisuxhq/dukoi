<script lang="ts">
import Browser from '#lib/components/docs/Browser.svelte'
import Code from '#lib/components/docs/Code.svelte'
import FileList from '#lib/components/docs/FileList.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import TemplatePage from '#lib/components/docs/TemplatePage.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'

const events = [
  ['Motion', 'just now', true],
  ['Motion', '18 min ago', true],
  ['Camera came on', '2 hours ago', false],
] as const

const pages = [
  ['/', 'The newest photo, what happened and the timelapse'],
  ['/live', 'The camera live, about 8 photos a second'],
  ['/snapshot.jpg', 'The newest photo, for scripts and other apps'],
  ['/camera', 'The camera itself. Opens only in Chrome on the phone'],
]

const change = `export const settings = {
  idleFps: 1,
  liveFps: 8,
  // Raise it if leaves or shadows set it off.
  motionArea: 0.05,
  motionCooldown: 120,
  timelapseEvery: 60,
}`
</script>

<TemplatePage
  id="door-cam"
  lead="Your phone’s own camera, live from anywhere, with a photo on your phone when something moves and a timelapse of every day."
>
  <Section id="what-you-get" title="What you get">
    <p>Chrome on the phone takes the photos and sends them to the app on the same phone. Everyone else watches from a browser.</p>
    <Browser url="192.168.0.112:3009">
      <div class="flex flex-col gap-px bg-divider">
        <div class="flex items-center gap-3 bg-card px-5 py-3.5">
          <span class="inline-flex items-center gap-1.5 rounded bg-coral-ink px-2 py-0.5 text-[11px] font-bold tracking-wider text-white">LIVE</span>
          <span class="font-medium text-ink">The camera is on</span>
          <span class="ml-auto text-sm text-muted">1 watching</span>
        </div>
        {#each events as [what, when, photo], i (i)}
          <div class="flex items-center gap-4 bg-card px-5 py-3">
            <span class="h-9 w-12 shrink-0 {photo ? 'bg-night-high' : ''}"></span>
            <span class="flex-1 font-medium text-ink">{what}</span>
            <span class="text-sm text-muted">{when}</span>
          </div>
        {/each}
      </div>
    </Browser>
    <ul class="list">
      {#each pages as [path, about] (path)}
        <li><code>{path}</code>: {about}</li>
      {/each}
    </ul>
  </Section>

  <Section id="turn-it-on" title="Turn the camera on">
    <p>Stand the phone where it can see your door and plug it in. Then, on the phone, open Chrome at the address the app’s page shows, like <code>http://localhost:3009/camera</code>, and tap <strong>Turn on the camera</strong>.</p>
    <p>The screen stays on but goes black, which uses almost no power on most phones. Tap it to see what the camera sees.</p>
    <Note title="Keep Chrome open" tone="warning">
      Browsers stop the camera when the page is hidden. If Chrome closes or the screen locks, the photos stop, and after 30 seconds you get an alert so you know to open it again.
    </Note>
    <p>Browsers only allow the camera on <code>localhost</code> or HTTPS, which is why the address uses <code>localhost</code>. The app also only takes photos from the phone itself: <code>/camera</code> refuses anyone else, and only that page gets the key that lets it send photos.</p>
  </Section>

  <Section id="alerts" title="Get alerts">
    <p>Alerts go through <a href="https://ntfy.sh">ntfy</a>, a free push app for Android and iOS with no account. The page shows a topic; subscribe to it in the app. Motion alerts come with a photo. To pick your own topic:</p>
    <Terminal command="dukoi env set NTFY_TOPIC=my-long-hard-to-guess-topic" />
  </Section>

  <Section id="watch-from-anywhere" title="Watch from anywhere">
    <p>On the same Wi-Fi, open the app’s local URL. Away from home, give it a <a href="/docs/public-urls">public URL</a> that only you can open:</p>
    <Terminal command="dukoi expose --auth" />
    <Note title="Always use --auth for a camera" tone="warning">
      Without it, anyone with the link could watch. With it on, open the sign-in link on the phone once too, so the camera page can reach the app.
    </Note>
  </Section>

  <Section id="make-it-yours" title="Make it yours">
    <p>Seven files. You only need to touch one.</p>
    <FileList
      files={[
        { name: 'settings.js', about: 'Photos a second, motion and the timelapse. Edit this one.', edit: true },
        { name: 'server.js', about: 'Keeps photos, streams /live and sends alerts' },
        { name: 'public/camera.html', about: 'The camera page Chrome runs on the phone' },
        { name: 'public/live.html', about: 'The live page' },
        { name: 'public/index.html', about: 'The main page' },
        { name: 'package.json', about: 'Its name and packages' },
        { name: 'README.md', about: 'How to run it, in five minutes' },
      ]}
    />
    <p>If leaves or shadows set off motion, ask for a bigger change and wait longer between alerts:</p>
    <Code code={change} />
    <Terminal command="dukoi deploy" />
    <p>Filming people outside your home can be against the law where you live. Point it at your own space.</p>
  </Section>
</TemplatePage>

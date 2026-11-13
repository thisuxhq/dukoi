<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'
</script>

<Header
  title="Benchmark your phone"
  lead="One command measures how many requests a second your phone can serve, how fast it answers and how warm it gets. Share it to see how it compares on dukoi.com/bench."
/>

<Section id="run" title="Run it">
  <p>Plug the phone in and close other apps you don’t need. Then, from any folder:</p>
  <Terminal
    command="dukoi bench"
    output={`
Benchmarking a024 (Nothing A024, SM8635, 12 GB, Android 16)

✓ Deployed the bench app
✓ On Wi-Fi            4,544 req/s   p99 13 ms
✓ Through the tunnel  2,800 req/s   p99 21 ms
✓ Hot, after 10 min   2,690 req/s   p99 22 ms   39 °C
✓ Removed the bench app`}
  />
  <p>It takes about 13 minutes. <code>dukoi bench --quick</code> skips the hot test and takes about 3.</p>
</Section>

<Section id="what" title="What it measures">
  <p>The bench deploys the notes API as an app called <code>dukoi-bench</code>, adds 20 notes, and loads <code>GET /notes</code> with 50 connections for 60 seconds at a time:</p>
  <ul class="list">
    <li><strong>On Wi-Fi</strong>: straight to the phone. This is what the phone can do by itself.</li>
    <li><strong>Through the tunnel</strong>: through a quick link, the way visitors reach your apps. Your home internet matters here as much as the phone.</li>
    <li><strong>Hot</strong>: after 10 minutes of load, when the phone has warmed up.</li>
  </ul>
  <p>Each line shows requests a second, p99 latency (99 in 100 requests answer faster than this) and the battery temperature. The bench app is removed at the end, even if you stop it with Ctrl+C.</p>
</Section>

<Section id="share" title="Share it">
  <Terminal command="dukoi bench --share" />
  <p>After the run, the phone signs the result and the CLI sends it to <a href="/bench">dukoi.com/bench</a>, where each phone model shows the median of everyone’s runs.</p>
  <p><strong>What’s sent:</strong> the phone’s maker, model, chip, memory and Android version, the Dukoi and Node versions, and the numbers. <strong>Never sent:</strong> the phone’s name, your apps, URLs, IP address or anything personal.</p>
  <p>A phone can share once an hour.</p>
</Section>

<Note title="Numbers lower than you expected?">
  Other running apps share the CPU, and the bench tells you how many were running. If it says this computer was the limit, close other programs or run it from a faster computer.
</Note>

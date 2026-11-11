<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Section from '#lib/components/docs/Section.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'
</script>

<Header
  title="Logs"
  lead="See what your apps print, live, from your terminal, the dashboard or the phone. Dukoi adds its own lines when it restarts something, so you know why."
/>

<Section id="follow" title="Follow an app’s logs">
  <Terminal
    command="npx dukoi logs"
    output={`
09:31:40 ●   Android stopped the app to save battery. Restarted now.
09:31:41 out hono-api listening on 3000
09:33:02 out GET /notes 200 3ms
09:33:05 err TypeError: Cannot read properties of undefined`}
  />
  <p>It prints the last 100 lines, then new ones as they arrive. <code>out</code> and <code>err</code> are your app’s output; the dot marks lines from Dukoi. Press Ctrl+C to stop.</p>
  <ul class="list">
    <li><code>--lines 500</code> shows more history.</li>
    <li><code>--no-follow</code> prints and exits.</li>
    <li>Outside the app’s folder, name it: <code>dukoi logs hono-api</code>.</li>
  </ul>
</Section>

<Section id="ps" title="See every app">
  <Terminal
    command="npx dukoi ps"
    output={`
APP        STATUS      CPU  MEM    UPTIME  RESTARTS  URL
hono-api   running     2%   48 MB  3d 4h   0         https://api.example.com
bot        running     0%   31 MB  3d 4h   1         http://192.168.0.112:3001
portfolio  restarting  –    –      –       4         http://192.168.0.112:3002`}
  />
  <p>When an app isn’t running, <code>ps</code> says why it last stopped and which logs to read.</p>
</Section>

<Section id="status" title="Check the phone">
  <Terminal
    command="npx dukoi status"
    output={`
a024  Nothing A024, Android 16
Apps      3 running of 3
Memory    61% used (2310 MB free of 5920 MB)
Storage   88.4 GB free of 119.2 GB
Load      0.42  0.38  0.35
Agent     0.1.0 on Node v24.11.1, up 3d 4h
Phone up  6d 2h
Address   192.168.0.112:7070`}
  />
</Section>

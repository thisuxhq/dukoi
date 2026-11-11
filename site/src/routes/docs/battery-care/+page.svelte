<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
</script>

<Header
  title="Battery care"
  lead="A server phone stays plugged in all day. Sitting at 100% wears the battery out and can make it swell, so cap charging at 80%."
/>

<Section id="limit" title="Turn on the 80% limit">
  <p>Most phones can stop charging at 80%, but each brand hides it somewhere else. Samsung calls it <strong>Protect battery</strong> and Pixel calls it <strong>Charging optimization</strong>.</p>
  <ol class="list">
    <li>In Dukoi, open <strong>Settings → Battery care</strong>.</li>
    <li>Tap <strong>Turn on</strong>. It opens your phone’s battery settings.</li>
    <li>Turn on the charge limit there. Apps can’t change it for you.</li>
  </ol>
</Section>

<Section id="watch" title="What Dukoi watches">
  <ul class="list">
    <li>Charge, temperature and battery health right now.</li>
    <li>Whether a limit is on. Android won’t say, so Dukoi looks: plugged in and resting at 90% or below means on. If it can’t tell yet, it says <strong>Not sure</strong>.</li>
    <li>The last 7 days: hours a day at 100%, and the hottest it got.</li>
  </ul>
  <p>Dukoi checks the battery every 10 minutes. The readings stay on the phone.</p>
</Section>

<Note title="Running hot?" tone="warning">
  Heat ages a battery faster than anything. Keep the phone out of its case and somewhere with air around it, and use a good charger.
</Note>

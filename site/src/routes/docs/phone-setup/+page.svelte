<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'

const brands: [string, string[]][] = [
  ['Google Pixel', ['Battery: Unrestricted. Pixels usually need nothing else.']],
  [
    'Samsung',
    [
      'Battery: Unrestricted.',
      'Take Dukoi out of Sleeping apps and Deep sleeping apps, and add it to Never sleeping apps.',
      'Turn off Put unused apps to sleep.',
    ],
  ],
  [
    'Xiaomi, Redmi, POCO',
    [
      'Autostart: on.',
      'Battery saver: No restrictions.',
      'Lock Dukoi in recent apps.',
      'If apps still stop, turn off MIUI optimization in Developer options.',
    ],
  ],
  [
    'Oppo, Realme, OnePlus',
    [
      'Allow auto launch and Allow background activity: on.',
      'Battery: turn off battery optimization for Dukoi.',
      'Lock Dukoi in recent apps.',
    ],
  ],
  ['Nothing', ['Battery: Unrestricted.', 'Lock Dukoi in recent apps.']],
]
</script>

<Header
  title="Set up the phone"
  lead="Android stops apps that run in the background for long. Setup is four steps on the phone, and each one only turns green once Android confirms it."
/>

<Section id="checklist" title="The four steps">
  <ol class="list">
    <li><strong>Keep Dukoi running.</strong> Starts Dukoi as a foreground service, with a notification that stays while it runs.</li>
    <li><strong>Turn off battery optimization.</strong> Stops Doze and App Standby from pausing Dukoi.</li>
    <li><strong>Allow child processes.</strong> Stops Android 12 and newer from killing your apps for using too much CPU.</li>
    <li><strong>Steps for your phone’s brand.</strong> Some makers add their own app killer. Dukoi spots the brand and shows only its steps.</li>
  </ol>
  <p>The checklist stays on screen until all four are green. If one slips later, the phone, the CLI and the dashboard all show a warning.</p>
</Section>

<Section id="child-processes" title="Allow child processes">
  <p>Your apps run as child processes of Dukoi, and from Android 12 the system can kill those. The fix depends on the Android version:</p>
  <ul class="list">
    <li><strong>Android 10 and 11:</strong> nothing to do.</li>
    <li><strong>Android 14 and newer:</strong> in Developer options, turn on <strong>Disable child process restrictions</strong>. Dukoi links straight to it.</li>
    <li><strong>Android 12 and 13:</strong> run this once from a computer with the phone plugged in and USB debugging on. Dukoi shows it with a copy button.</li>
  </ul>
  <Terminal command="adb shell device_config set_sync_disabled_for_tests persistent && adb shell device_config put activity_manager max_phantom_processes 2147483647" />
</Section>

<Section id="brands" title="Steps by brand">
  <p>Menu names change between versions, so Dukoi shows the right ones for your phone. In short:</p>
  <dl class="flex flex-col gap-px bg-divider">
    {#each brands as [brand, steps] (brand)}
      <div class="flex flex-col gap-1.5 bg-card px-4 py-4 sm:flex-row sm:gap-6 lg:px-5">
        <dt class="text-[15px] leading-6 font-medium sm:w-44 sm:shrink-0">{brand}</dt>
        <dd class="flex flex-col gap-1 text-[15px] leading-6 text-body">
          {#each steps as step (step)}<span>{step}</span>{/each}
        </dd>
      </div>
    {/each}
  </dl>
</Section>

<Section id="placement" title="Where to keep the phone">
  <ul class="list">
    <li>Use a spare phone, factory reset, not the one you use every day.</li>
    <li>Keep it in open air, out of drawers and cases, so it stays cool.</li>
    <li>Use a good charger and cable, and Wi-Fi rather than mobile data.</li>
    <li>Give it a fixed address on your router (a DHCP reservation), so its local URLs don’t change.</li>
  </ul>
  <Note title="Plugged in all day?">
    Turn on your phone’s 80% charge limit to save the battery. <a href="/docs/battery-care">Battery care</a> shows how.
  </Note>
</Section>

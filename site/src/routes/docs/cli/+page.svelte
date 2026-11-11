<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Section from '#lib/components/docs/Section.svelte'

// Every command the CLI has today, from `droidhost --help`.
const groups: { id: string; title: string; rows: [string, string][] }[] = [
  {
    id: 'pairing',
    title: 'Pairing',
    rows: [
      [
        'pair',
        'Find a phone on this Wi-Fi and link it to this computer. `--host 192.168.0.112` skips the search, `--name kitchen` names it.',
      ],
      ['devices', 'List paired phones. The dot marks the last one used.'],
      ['unpair [phone]', 'Forget a phone, and ask it to forget this computer.'],
    ],
  },
  {
    id: 'apps',
    title: 'Apps',
    rows: [
      [
        'deploy [folder]',
        'Ship an app to the phone. The folder defaults to this one. `--name` sets the app’s name, `--no-health-check` is for apps that open no port.',
      ],
      ['start [app]', 'Start an app.'],
      ['stop [app]', 'Stop an app. It stays stopped after a reboot.'],
      ['restart [app]', 'Restart an app.'],
      ['releases [app]', 'List the last 5 releases.'],
      ['rollback [app]', 'Go back to the previous release. `--to 0002` picks another.'],
      [
        'remove [app]',
        'Delete an app with its releases, data and logs. Asks first; `--yes` skips that.',
      ],
      [
        'expose [app]',
        'Give an app a public HTTPS URL. `--domain api.example.com` uses your domain, `--off` removes it.',
      ],
    ],
  },
  {
    id: 'watching',
    title: 'Watching',
    rows: [
      ['ps', 'Every app: status, CPU, memory, uptime, restarts and URL.'],
      [
        'logs [app]',
        'The last 100 lines, then live. `--lines 500` for more, `--no-follow` to print and exit.',
      ],
      ['status', 'Phone health: memory, storage, load, uptime and address.'],
      ['dashboard', 'Open the web dashboard on this computer. `--no-open` skips the browser.'],
    ],
  },
  {
    id: 'options',
    title: 'Options for every command',
    rows: [
      ['--device <name>', 'Which phone. Defaults to the last one used.'],
      ['--json', 'One JSON object on stdout, for scripts and AI agents.'],
      ['--help, -h', 'Show help.'],
      ['--version, -v', 'Show the version.'],
    ],
  },
]
</script>

<Header
  title="CLI commands"
  lead="Every command and flag the CLI has today. Commands that take an app use the one in the current folder when you leave it out."
/>

<p class="pb-10">Run any command with <code>npx droidhost</code>, or install it once with <code>npm i -g droidhost</code>.</p>

{#each groups as group (group.id)}
  <Section id={group.id} title={group.title}>
    <dl class="flex flex-col gap-px bg-divider">
      {#each group.rows as [command, meaning] (command)}
        <div class="flex flex-col gap-1.5 bg-card px-4 py-3.5 sm:flex-row sm:gap-6 lg:px-5">
          <dt class="font-mono text-sm leading-6 sm:w-44 sm:shrink-0">{command}</dt>
          <dd class="text-[15px] leading-6 text-body">
            {#each meaning.split('`') as part, i (i)}{#if i % 2}<code>{part}</code>{:else}{part}{/if}{/each}
          </dd>
        </div>
      {/each}
    </dl>
  </Section>
{/each}

<Section id="exit-codes" title="Exit codes and errors">
  <p><code>0</code> means it worked, <code>1</code> means the command failed and <code>2</code> means it was typed wrong. With <code>--json</code>, errors come back as <code>{'{ "ok": false, "error": { "code", "message", "hint" } }'}</code>, and the codes don’t change between versions.</p>
</Section>

<script lang="ts">
import Header from '#lib/components/docs/Header.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'
</script>

<Header
  title="AI agents"
  lead="Ask Claude Code, Codex, Cursor or another coding agent to build an app and put it on your phone. Use the Dukoi skill for shell-based coding agents, or connect any MCP client directly with dukoi mcp."
/>

<Section id="skill" title="The Dukoi skill">
  <p>Installing the CLI also installs the skill for every coding agent it finds on your computer. Run the install line again to update both.</p>
  <Terminal
    command="curl -fsSL https://dukoi.com/install | sh"
    output={`
→ Downloading dukoi-darwin-arm64.tar.gz
✓ Installed dukoi 0.3.0 in ~/.dukoi
  Taught Claude Code and Codex to use Dukoi`}
  />
  <p>Then ask your agent for what you want, in your own words:</p>
  <pre class="bg-card px-5 py-4 font-mono text-sm leading-6 whitespace-pre-wrap">Build a Telegram bot that sends me the weather every morning, and deploy it to my phone.</pre>
  <p>Start a new agent session after installing, so it picks up the skill.</p>
</Section>

<Section id="install" title="Add it by hand">
  <p>Installed an agent after Dukoi? Run this to add the skill to it:</p>
  <Terminal command="dukoi skill" />
  <p><code>dukoi skill --off</code> removes it. The skill is also on skills.sh, for agents the CLI doesn’t know about or a computer without Dukoi:</p>
  <Terminal command="npx skills add thisuxhq/dukoi" />
</Section>

<Section id="what-it-knows" title="What the skill teaches">
  <ul class="list">
    <li>What the phone runs: static sites, and Node.js 24 apps started with plain <code>node</code>.</li>
    <li>The rules for an app that deploys first time: listen on <code>PORT</code>, keep data in <code>DATA_DIR</code>, read secrets from settings and use no native modules.</li>
    <li>Every command, with <code>--json</code> for output it can read, and what each error code means.</li>
    <li>The templates, so it starts from the closest one.</li>
    <li>To ask you first before it deletes an app, rolls back or makes something public.</li>
  </ul>
  <p>Agents that read the web can use <a href="/skill.md">dukoi.com/skill.md</a> or <a href="/llms.txt">llms.txt</a> instead.</p>
</Section>

<Section id="mcp" title="Local MCP server">
  <p>Want Claude Desktop, Cursor, Claude Code or another MCP client to talk to your phone directly? <code>dukoi mcp</code> runs a local MCP server over stdio. It reuses this computer’s paired Ed25519 key over Wi-Fi or Tailscale, so the admin API still never goes through a tunnel.</p>
  <p>Add Dukoi to the MCP clients installed on this computer:</p>
  <Terminal command="dukoi mcp install" />
  <p>This registers Dukoi in Claude Desktop, Cursor and Claude Code without touching your other MCP servers. Restart the client to pick it up. Run <code>dukoi mcp install --off</code> to remove it.</p>
  <ul class="list">
    <li><strong>Read-only tools:</strong> <code>dukoi_devices</code>, <code>dukoi_status</code>, <code>dukoi_ps</code>, <code>dukoi_logs</code>, <code>dukoi_inspect</code>, <code>dukoi_releases</code>, <code>dukoi_env_list</code> and <code>dukoi_db_list</code>.</li>
    <li><strong>Action tools:</strong> <code>dukoi_deploy</code>, <code>dukoi_replay</code>, <code>dukoi_control</code>, <code>dukoi_rollback</code>, <code>dukoi_expose</code>, <code>dukoi_env_set</code>, <code>dukoi_db_create</code> and <code>dukoi_db_connect</code>.</li>
    <li><strong>Resources:</strong> <code>dukoi://devices</code>, <code>dukoi://phone/status</code>, <code>dukoi://apps</code>, <code>dukoi://apps/{'{app}'}/logs</code> and <code>dukoi://apps/{'{app}'}/requests</code>.</li>
    <li><strong>Prompts:</strong> <code>debug-app</code> and <code>deploy-check</code>.</li>
  </ul>
  <p>Secrets stay safe: <code>dukoi_env_list</code> returns names only, <code>dukoi_env_set</code> never echoes values, and database URLs mask passwords.</p>
</Section>

<Note title="You still approve the phone">
  An agent can pair, deploy and read logs, but only you can tap Approve on the phone when pairing. Settings go to the phone and their values never come back, so an agent can’t read them later.
</Note>

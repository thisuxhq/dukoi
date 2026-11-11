<script lang="ts">
import Browser from '#lib/components/docs/Browser.svelte'
import Code from '#lib/components/docs/Code.svelte'
import FileList from '#lib/components/docs/FileList.svelte'
import Section from '#lib/components/docs/Section.svelte'
import TemplatePage from '#lib/components/docs/TemplatePage.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'

const response = `{
  "name": "mcp-server",
  "mcp": "http://192.168.0.112:3002/mcp",
  "tools": ["save_note", "list_notes"],
  "connect": "claude mcp add --transport http dukoi http://192.168.0.112:3002/mcp"
}`

const change = `{
  name: 'roll_dice',
  description: 'Roll a dice with the given number of sides',
  inputSchema: { type: 'object', properties: { sides: { type: 'number' } } },
  run: ({ sides = 6 }) => \`You rolled \${1 + Math.floor(Math.random() * sides)}\`,
},`
</script>

<TemplatePage
  id="mcp-server"
  lead="A Model Context Protocol server with tools to save and list notes. Your AI assistant gets a memory that runs on your phone all day."
>
  <Section id="what-you-get" title="What you get">
    <p>MCP over HTTP at <code>/mcp</code>. Open the URL and it tells you its tools and how to connect. Notes are kept in <code>DATA_DIR</code>.</p>
    <Browser url="192.168.0.112:3002">
      <pre class="overflow-x-auto px-[22px] py-5 font-mono text-sm leading-6">{response}</pre>
    </Browser>
    <p>Connect Claude Code to it:</p>
    <Terminal command="claude mcp add --transport http dukoi http://192.168.0.112:3002/mcp" />
    <p>For an assistant outside your Wi-Fi, give the app a <a href="/docs/public-urls">public URL</a> and use that, plus <code>/mcp</code>.</p>
  </Section>

  <Section id="make-it-yours" title="Make it yours">
    <p>Four files. You only need to touch one.</p>
    <FileList
      files={[
        { name: 'tools.js', about: 'The tools. Edit this one.', edit: true },
        { name: 'server.js', about: 'MCP over HTTP. No need to touch it.' },
        { name: 'package.json', about: 'Its name and packages' },
        { name: 'README.md', about: 'How to run it, in five minutes' },
      ]}
    />
    <p>Add a tool to the list in <code>tools.js</code>:</p>
    <Code code={change} />
    <p>Then deploy again. Your assistant sees the new tool the next time it connects.</p>
    <Terminal command="npx dukoi deploy" />
  </Section>
</TemplatePage>

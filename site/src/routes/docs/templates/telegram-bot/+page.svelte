<script lang="ts">
import Code from '#lib/components/docs/Code.svelte'
import FileList from '#lib/components/docs/FileList.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import TemplatePage from '#lib/components/docs/TemplatePage.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'

const change = `if (text === '/start') {
  return 'Welcome to my bot 👋'
}`
</script>

<TemplatePage
  id="telegram-bot"
  lead="A Telegram bot that replies to messages, always on. It asks Telegram for new messages itself, so it needs no public URL."
>
  <Section id="token" title="You need a token">
    <ol class="list">
      <li>In Telegram, message <strong>@BotFather</strong> and send <code>/newbot</code>.</li>
      <li>Pick a name. BotFather gives you a token like <code>123456:ABC-def…</code>.</li>
    </ol>
    <p><code>init</code> asks for it and saves it on the phone as a setting, never in the folder. To change it later:</p>
    <Terminal command="npx droidhost env set TELEGRAM_BOT_TOKEN=123456:ABC..." />
  </Section>

  <Section id="what-you-get" title="What you get">
    <p>Message your bot. It answers <code>/start</code> and repeats anything else you send.</p>
    <div class="flex flex-col gap-2.5 bg-sky p-5 lg:p-6" aria-hidden="true">
      <p class="ml-auto bg-white px-3.5 py-2 text-[15px] text-ink">/start</p>
      <p class="mr-auto bg-blue px-3.5 py-2 text-[15px] text-white">Hi! I run on an old phone.</p>
      <p class="ml-auto bg-white px-3.5 py-2 text-[15px] text-ink">hello</p>
      <p class="mr-auto bg-blue px-3.5 py-2 text-[15px] text-white">You said: hello</p>
    </div>
  </Section>

  <Section id="make-it-yours" title="Make it yours">
    <p>Four files. You only need to touch one.</p>
    <FileList
      files={[
        { name: 'bot.js', about: 'The replies. Edit this one.', edit: true },
        { name: 'droidhost.json', about: 'Tells DroidHost it opens no port' },
        { name: 'package.json', about: 'Its name. No packages needed.' },
        { name: 'README.md', about: 'How to run it, in five minutes' },
      ]}
    />
    <p>Change the <code>/start</code> reply in <code>bot.js</code>:</p>
    <Code code={change} />
    <p>Then deploy again. The bot keeps its token.</p>
    <Terminal command="npx droidhost deploy" />
    <Note title="No health check">
      A bot opens no port, so <code>droidhost.json</code> turns the check off. DroidHost counts it as healthy if it’s still running after 3 seconds.
    </Note>
  </Section>
</TemplatePage>

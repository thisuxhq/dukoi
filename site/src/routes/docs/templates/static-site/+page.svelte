<script lang="ts">
import Browser from '#lib/components/docs/Browser.svelte'
import Code from '#lib/components/docs/Code.svelte'
import FileList from '#lib/components/docs/FileList.svelte'
import Section from '#lib/components/docs/Section.svelte'
import TemplatePage from '#lib/components/docs/TemplatePage.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'

const change = `<h1>Hi, I'm Priya</h1>`
</script>

<TemplatePage
  id="static-site"
  lead="A clean one-page site with your name on it. Plain HTML and CSS, no build step. Use it for a portfolio, a link page or a landing page."
>
  <Section id="what-you-get" title="What you get">
    <p>A page that says who you are, with a short intro and your links. There’s no <code>package.json</code>: Dukoi serves the folder as it is.</p>
    <Browser url="192.168.0.112:3001">
      <div class="flex flex-col gap-3 px-6 py-8 lg:px-10 lg:py-12">
        <p class="font-display text-[32px] leading-9 font-medium tracking-[-0.03em] text-ink lg:text-[40px] lg:leading-[44px]">Hi, I’m Your Name</p>
        <p class="max-w-[440px]">I make things on the web. This site runs on an old phone in my drawer.</p>
        <p class="flex gap-4 text-[15px] font-medium text-violet">GitHub · Email · Blog</p>
      </div>
    </Browser>
  </Section>

  <Section id="make-it-yours" title="Make it yours">
    <p>Three files. Start with one.</p>
    <FileList
      files={[
        { name: 'index.html', about: 'Your name, intro and links. Edit this one.', edit: true },
        { name: 'style.css', about: 'Colours and fonts' },
        { name: 'README.md', about: 'How to run it, in five minutes' },
      ]}
    />
    <p>Put your own name in <code>index.html</code>, in place of “Your Name”:</p>
    <Code code={change} />
    <p>Then deploy again. The new page is live in a few seconds.</p>
    <Terminal command="dukoi deploy" />
  </Section>
</TemplatePage>

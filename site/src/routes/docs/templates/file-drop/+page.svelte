<script lang="ts">
import Browser from '#lib/components/docs/Browser.svelte'
import Code from '#lib/components/docs/Code.svelte'
import FileList from '#lib/components/docs/FileList.svelte'
import Note from '#lib/components/docs/Note.svelte'
import Section from '#lib/components/docs/Section.svelte'
import TemplatePage from '#lib/components/docs/TemplatePage.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'
</script>

<TemplatePage
  id="file-drop"
  lead="Drop a file on a page and get a link to share. The files stay on your phone, not in someone else’s cloud."
>
  <Section id="what-you-get" title="What you get">
    <p>An upload page. Drop a file on it and you get a link like <code>/f/k3x9/photo.jpg</code> that anyone with the URL can open. Files are kept in <code>DATA_DIR</code>, so they survive deploys.</p>
    <Browser url="192.168.0.112:3003">
      <div class="flex flex-col gap-4 p-6 lg:p-8">
        <div class="flex flex-col items-center gap-1 border-[1.5px] border-dashed border-line px-6 py-10 text-center">
          <p class="font-medium text-ink">Drop a file here</p>
          <p class="text-sm text-muted">Up to 50 MB</p>
        </div>
        <p class="flex items-center justify-between gap-4 bg-canvas px-4 py-3 text-sm">
          <span class="text-ink">photo.jpg</span>
          <span class="font-mono text-[13px] text-violet">/f/k3x9/photo.jpg</span>
        </p>
      </div>
    </Browser>
  </Section>

  <Section id="make-it-yours" title="Make it yours">
    <p>Four files. The size limit is the first thing most people change.</p>
    <FileList
      files={[
        { name: 'server.js', about: 'Uploads and links. MAX_MB is near the top.', edit: true },
        { name: 'public/index.html', about: 'The upload page' },
        { name: 'package.json', about: 'Its name and packages' },
        { name: 'README.md', about: 'How to run it, in five minutes' },
      ]}
    />
    <p>Raise the limit in <code>server.js</code>:</p>
    <Code code="const MAX_MB = 200" />
    <Note title="Sharing big files outside your Wi-Fi?" tone="warning">
      Cloudflare’s free plan limits uploads through a public URL to 100 MB. On your Wi-Fi there’s no such limit.
    </Note>
    <p>Then deploy again. Files already uploaded stay where they are.</p>
    <Terminal command="npx dukoi deploy" />
  </Section>
</TemplatePage>

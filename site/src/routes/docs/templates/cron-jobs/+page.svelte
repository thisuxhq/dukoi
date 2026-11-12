<script lang="ts">
import Browser from '#lib/components/docs/Browser.svelte'
import Code from '#lib/components/docs/Code.svelte'
import FileList from '#lib/components/docs/FileList.svelte'
import Section from '#lib/components/docs/Section.svelte'
import TemplatePage from '#lib/components/docs/TemplatePage.svelte'
import Terminal from '#lib/components/docs/Terminal.svelte'

const change = `{
  name: 'Say good morning',
  schedule: '0 8 * * *',
  async run() {
    return 'Good morning'
  },
},`
</script>

<TemplatePage
  id="cron-jobs"
  lead="Run your code on a schedule, all day, on your phone. A page shows when each job runs next and how its last run went."
>
  <Section id="what-you-get" title="What you get">
    <p>Two jobs to start: one lists new posts on the Hacker News front page every 15 minutes, and one checks the phone’s free space every hour. Runs are kept in <code>DATA_DIR</code>.</p>
    <Browser url="192.168.0.112:3007">
      <div class="flex flex-col gap-3 bg-card px-5 py-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex flex-col">
            <span class="font-medium text-ink">New posts on Hacker News</span>
            <span class="font-mono text-[13px] text-muted">*/15 * * * *</span>
          </div>
          <div class="flex flex-col items-end text-right">
            <span class="text-sm font-semibold text-running">Worked</span>
            <span class="text-[13px] text-muted">2 min ago, took 412 ms</span>
          </div>
        </div>
        <pre class="bg-canvas px-4 py-3 font-mono text-[13px] leading-5 text-ink">2 new on the front page
  Show HN: I run my side projects on an old Pixel
  The quiet comeback of SQLite</pre>
      </div>
    </Browser>
  </Section>

  <Section id="make-it-yours" title="Make it yours">
    <p>Six files. You only need to touch one.</p>
    <FileList
      files={[
        { name: 'jobs.js', about: 'The jobs and when they run. Edit this one.', edit: true },
        { name: 'schedule.js', about: 'Reads cron schedules' },
        { name: 'server.js', about: 'Runs jobs on time and serves the page' },
        { name: 'public/index.html', about: 'The jobs page' },
        { name: 'package.json', about: 'Its name and packages' },
        { name: 'README.md', about: 'How to run it, in five minutes' },
      ]}
    />
    <p>Add a job to the list in <code>jobs.js</code>. What <code>run()</code> returns shows on the page:</p>
    <Code code={change} />
    <Terminal command="dukoi deploy" />
    <p>A schedule is cron’s five parts: minute, hour, day of month, month and day of week. <code>*/15 * * * *</code> is every 15 minutes, <code>0 9 * * 1-5</code> is 09:00 on weekdays, and <code>@hourly</code>, <code>@daily</code>, <code>@weekly</code> and <code>@monthly</code> work too. Times use the phone’s time zone.</p>
  </Section>
</TemplatePage>

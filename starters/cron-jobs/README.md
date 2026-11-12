# cron-jobs

Runs your code on a schedule, on the phone, all day. The page lists each job, when it runs next, and how its last run went. Runs are saved in `DATA_DIR`, so they survive deploys.

It comes with two jobs: one lists new posts on the Hacker News front page every 15 minutes, and one checks the phone's free space every hour.

## Make it yours

Add a job to the list in `jobs.js`:

```js
{
  name: 'Say good morning',
  schedule: '0 8 * * *',
  async run() {
    return 'Good morning'
  },
},
```

Then run:

```bash
dukoi deploy
```

What `run()` returns shows on the page. `console.log` goes to the app's logs (`dukoi logs`).

## Schedules

A schedule has five parts: minute, hour, day of month, month and day of week.

| Schedule | Runs |
| --- | --- |
| `*/15 * * * *` | Every 15 minutes |
| `0 * * * *` or `@hourly` | At the start of every hour |
| `30 7 * * *` | Every day at 07:30 |
| `0 9 * * 1-5` | At 09:00 on weekdays |
| `0 0 1 * *` or `@monthly` | At midnight on the 1st of the month |

Times use the phone's time zone. To use another one:

```bash
dukoi env set TZ=Europe/London
```

Anyone who can open the page can press **Run now**. Keep it on your Wi-Fi, or add a check in `server.js` before you make it public.

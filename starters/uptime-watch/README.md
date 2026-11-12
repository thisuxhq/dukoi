# uptime-watch

Checks your sites every minute from the phone and sends a push to your phone when one goes down, then again when it’s back. The page shows the last 30 checks for each site. Checks are saved in `DATA_DIR`, so they survive deploys.

## Get alerts

Alerts go through [ntfy](https://ntfy.sh), a free push service with an app for Android and iOS. You don’t need an account. Open the app’s page, copy the topic and subscribe to it in the ntfy app.

The topic is made up the first time the app runs. To pick your own:

```bash
dukoi env set NTFY_TOPIC=my-long-hard-to-guess-topic
```

Anyone who knows the topic can read the alerts, so keep it long.

## Make it yours

Put your own sites in `sites.js`, then run:

```bash
dukoi deploy
```

Addresses on your Wi-Fi work too, like `http://192.168.1.1` for your router, which a server in the cloud can’t check.

A site counts as down after 2 failed checks in a row, so one slow answer doesn’t wake you. Change `FAILS_FOR_DOWN` at the top of `server.js` if you want it sooner or later.

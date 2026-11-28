# door-cam

Turns the phone's own camera into a camera you can watch from anywhere. Chrome on the phone takes the photos, and this app keeps them, streams them live and sends you a photo when something moves.

| Page | What it shows |
| --- | --- |
| `/` | The newest photo, what happened (motion, camera off and on) and the timelapse |
| `/live` | The camera live, about 8 photos a second while someone watches |
| `/snapshot.jpg` | The newest photo, for scripts and other apps |
| `/camera` | The camera itself. Only opens in Chrome on the phone |

## Turn the camera on

1. Stand the phone where it can see your door and plug it in.
2. On the phone, open Chrome at `http://localhost:<port>/camera`. The app's page shows the exact address.
3. Tap **Turn on the camera** and allow it.

The screen stays on but goes black, which uses almost no power on most phones. Tap it to see what the camera sees.

Leave Chrome open on that page. Browsers stop the camera when the page is hidden, so if Chrome closes or the screen locks, the photos stop. After 30 seconds without a photo you get an alert, so you know to open it again.

Browsers only allow the camera on `localhost` or HTTPS, which is why the address uses `localhost`. The app also only takes photos from the phone itself: `/camera` refuses anyone else, and only that page gets the key that lets it send photos.

## Get alerts

Alerts go through [ntfy](https://ntfy.sh), a free push service with an app for Android and iOS. You don't need an account. Open the app's page, copy the topic and subscribe to it in the ntfy app. Motion alerts come with a photo.

The topic is made up the first time the app runs. To pick your own:

```bash
dukoi env set NTFY_TOPIC=my-long-hard-to-guess-topic
```

Anyone who knows the topic can read the alerts and see the photos, so keep it long. The free ntfy.sh allows 250 alerts a day, so raise `motionCooldown` in `settings.js` if your camera sees a lot of movement.

## Watch from anywhere

On the same Wi-Fi, open the app's local URL. Away from home, give it a public URL that only you can open:

```bash
dukoi expose --auth
```

Don't use `dukoi expose` without `--auth` for a camera: anyone with the link could watch. If you turn on `--auth`, open the sign-in link on the phone once too, so the camera page can reach the app.

## Make it yours

Change how it behaves in `settings.js`: photos a second, photo size, how much has to move to count as motion, the time between alerts and how often the timelapse saves a photo. Then run:

```bash
dukoi deploy
```

Photos for the timelapse and motion events are saved in `DATA_DIR`, so they survive deploys. At the defaults the timelapse takes about 50 MB a day, and 7 days are kept.

Filming people outside your home can be against the law where you live. Point it at your own space.

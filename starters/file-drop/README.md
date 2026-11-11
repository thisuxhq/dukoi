# file-drop

Upload a file, get a link to share. Files are saved on the phone, in `DATA_DIR`, so they survive deploys and rollbacks.

## Make it yours

The size limit is `MAX_MB` at the top of `server.js`. Change it, then run:

```bash
npx dukoi deploy
```

The upload page is `public/index.html`. Cloudflare’s free plan stops public uploads at 100 MB; on your Wi-Fi there’s no such limit.

Anyone with the link can open a file, and anyone who can reach the page can upload. Keep it on your Wi-Fi, or add a password check in `server.js` before you make it public.

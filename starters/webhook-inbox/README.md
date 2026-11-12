# webhook-inbox

Catch webhooks from Stripe, GitHub, Shopify or anything else, and watch them arrive on a page. Every request to `/hook` is saved on the phone, in `DATA_DIR`, with its headers and body.

## Get a public address

Services on the internet can't reach your Wi-Fi, so give the app a public URL:

```bash
dukoi expose
```

Open the URL it prints. The page shows the address to paste into the service's webhook settings.

## Try it

```bash
curl -d '{"hello":"phone"}' -H 'content-type: application/json' http://<phone>:<port>/hook
```

Anything under `/hook` works too, so you can give each service its own path, like `/hook/stripe`.

## Make it yours

Edit `handle()` in `handle.js` to act on each webhook: check a signature, save an order, send a message. What it returns is the reply. Then run:

```bash
dukoi deploy
```

The inbox keeps the last 200 requests. Change `KEEP` at the top of `server.js` for more.

Anyone who can open the page sees every request, headers included, and some services put secrets in headers. Don't share the URL, or add a password check to `GET /` and `GET /requests` in `server.js`.

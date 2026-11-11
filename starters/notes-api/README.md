# notes-api

A small JSON API for notes, built with [Hono](https://hono.dev). Notes are saved in SQLite, which is built into Node, so nothing needs compiling on the phone.

## Make it yours

Edit `server.js`. Add your routes next to the notes ones, then run:

```bash
npx droidhost deploy
```

Your notes survive deploys and rollbacks: they live in `DATA_DIR`, which DroidHost keeps.

## Try it

```bash
curl http://<phone>:3000/
curl -X POST http://<phone>:3000/notes -H 'content-type: application/json' -d '{"text":"buy milk"}'
curl http://<phone>:3000/notes
```

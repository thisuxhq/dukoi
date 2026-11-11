# hono-api

A small JSON API for notes, built on [Hono](https://hono.dev) with SQLite built into Node (`node:sqlite`). No native modules, so it runs on a phone.

```bash
droidhost deploy
curl http://<phone>:3000/
curl -X POST http://<phone>:3000/notes -H 'content-type: application/json' -d '{"text":"hello"}'
curl http://<phone>:3000/notes
```

Notes live in `$DATA_DIR/notes.db`, which DroidHost keeps across deploys and rollbacks.

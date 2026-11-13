-- Runs shared with `dukoi bench --share`. See docs/benchmarks.md and site/bench-api.ts.
CREATE TABLE runs (
  id          TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,      -- milliseconds since 1970
  phone_hash  TEXT NOT NULL,         -- SHA-256 of the phone's public key, never the key
  model_slug  TEXT NOT NULL,         -- "google-pixel-10a"
  maker       TEXT,
  model       TEXT NOT NULL,
  chip        TEXT,
  ram_gb      INTEGER NOT NULL,
  android     TEXT NOT NULL,
  dukoi       TEXT NOT NULL,
  node        TEXT NOT NULL,
  lab         INTEGER NOT NULL DEFAULT 0,
  result      TEXT NOT NULL          -- the result exactly as the phone signed it
);
CREATE INDEX runs_model ON runs (model_slug, created_at);
CREATE INDEX runs_phone ON runs (phone_hash, created_at);

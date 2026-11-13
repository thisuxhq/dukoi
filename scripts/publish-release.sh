#!/usr/bin/env bash
# Uploads build/release (the APK, the CLI archives, SHA256SUMS and VERSION) to the
# dukoi-downloads R2 bucket, where dukoi.com/download serves them. Keeps a copy
# per version in <version>/, and latest/ is what new installs get.
#
# Usage: scripts/publish-release.sh   (scripts/release.sh runs it for you)
# Safe to run again: it uploads everything again, so it finishes a broken run.
# Needs:  wrangler login, with access to the account that owns dukoi.com
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
dir="$repo_dir/build/release"
[ -f "$dir/SHA256SUMS" ] || { echo "✗ Nothing to publish. Run: scripts/release.sh <version>" >&2; exit 1; }

# Big uploads sometimes hit a brief Cloudflare error (502), so try each one 3 times
put() {
  for attempt in 1 2 3; do
    bunx wrangler r2 object put "dukoi-downloads/$1" --file "$2" --remote >/dev/null 2>&1 && return 0
    [ "$attempt" = 3 ] || { echo "  Upload of $1 failed, trying again in $((attempt * 10))s"; sleep $((attempt * 10)); }
  done
  echo "✗ Couldn't upload $1 after 3 tries. Run scripts/publish-release.sh again to finish." >&2
  return 1
}

version="$(grep -o "DUKOI_VERSION = '[^']*'" "$repo_dir/shared/src/version.ts" | cut -d"'" -f2)"
cd "$repo_dir/site"
# SHA256SUMS goes after the files it checks, so a new checksum never points at an
# old file. VERSION goes last: `dukoi update` reads it, then installs (D-119).
for file in "$dir"/dukoi-* "$dir"/dukoi.apk "$dir/SHA256SUMS" "$dir/VERSION"; do
  [ -f "$file" ] || continue
  name="$(basename "$file")"
  for key in "$version/$name" "latest/$name"; do
    put "$key" "$file"
  done
  echo "✓ $name"
done
echo "✓ Published Dukoi $version to dukoi.com/download"

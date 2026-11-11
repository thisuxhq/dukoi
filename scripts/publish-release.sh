#!/usr/bin/env bash
# Uploads build/release (the APK, the CLI archives and SHA256SUMS) to the
# dukoi-downloads R2 bucket, where dukoi.com/download serves them. Keeps a copy
# per version in <version>/, and latest/ is what new installs get.
#
# Usage: scripts/publish-release.sh   (scripts/release.sh runs it for you)
# Needs:  wrangler login, with access to the account that owns dukoi.com
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
dir="$repo_dir/build/release"
[ -f "$dir/SHA256SUMS" ] || { echo "✗ Nothing to publish. Run: scripts/release.sh <version>" >&2; exit 1; }

version="$(grep -o "DUKOI_VERSION = '[^']*'" "$repo_dir/shared/src/version.ts" | cut -d"'" -f2)"
cd "$repo_dir/site"
# SHA256SUMS goes last, so a new checksum never points at an old file
for file in "$dir"/dukoi-* "$dir"/dukoi.apk "$dir/SHA256SUMS"; do
  [ -f "$file" ] || continue
  name="$(basename "$file")"
  for key in "$version/$name" "latest/$name"; do
    bunx wrangler r2 object put "dukoi-downloads/$key" --file "$file" --remote >/dev/null
  done
  echo "✓ $name"
done
echo "✓ Published Dukoi $version to dukoi.com/download"

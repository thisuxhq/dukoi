#!/usr/bin/env bash
# Uploads build/cli (from scripts/build-cli.ts) to the dukoi-downloads R2
# bucket, where dukoi.com/download serves it to the install scripts. Keeps a
# copy per version, and cli/latest is what new installs get.
#
# Usage: bun scripts/build-cli.ts && scripts/publish-cli.sh
# Needs:  wrangler login, with access to the account that owns dukoi.com
set -euo pipefail

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
dir="$repo_dir/build/cli"
[ -f "$dir/SHA256SUMS" ] || { echo "✗ Nothing to publish. Run: bun scripts/build-cli.ts" >&2; exit 1; }

version="$(grep -m1 "^const VERSION" "$repo_dir/cli/src/main.ts" | cut -d"'" -f2)"
cd "$repo_dir/site"
for file in "$dir"/dukoi-* "$dir/SHA256SUMS"; do
  name="$(basename "$file")"
  for key in "cli/$version/$name" "cli/latest/$name"; do
    bunx wrangler r2 object put "dukoi-downloads/$key" --file "$file" --remote >/dev/null
  done
  echo "✓ $name"
done
echo "✓ Published dukoi $version. New installs get it from https://dukoi.com/install"

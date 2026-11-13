#!/usr/bin/env bash
# Downloads our prebuilt Valkey (Redis) for Android from the GitHub Release.
# Use this for app builds. Only rebuild it (build-valkey-android.sh) when
# upgrading Valkey.
#
# Usage: scripts/fetch-valkey.sh [version]
# Output: build/valkey-android/<version>/valkey-server
# Needs:  gh (GitHub CLI), signed in with access to thisuxhq/dukoi
set -euo pipefail

VALKEY_VERSION="${1:-9.1.3}"
REPO=thisuxhq/dukoi
TAG="valkey-$VALKEY_VERSION-android-arm64"
ASSET="$TAG.xz"

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
out_dir="$repo_dir/build/valkey-android/$VALKEY_VERSION"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

if [ -x "$out_dir/valkey-server" ] && [ "$(file -b "$out_dir/valkey-server" | grep -c 'ARM aarch64')" = 1 ]; then
  echo "✓ Already have build/valkey-android/$VALKEY_VERSION/valkey-server"
  exit 0
fi

command -v gh >/dev/null || { echo "✗ Needs the GitHub CLI: brew install gh, then gh auth login" >&2; exit 1; }

echo "→ Downloading $ASSET from $REPO"
gh release download "$TAG" --repo "$REPO" --pattern "$ASSET" --pattern SHA256SUMS --dir "$work_dir"

echo "→ Checking SHA-256"
(cd "$work_dir" && grep " $ASSET\$" SHA256SUMS | shasum -a 256 -c -)

echo "→ Unpacking"
xz -d "$work_dir/$ASSET"
(cd "$work_dir" && grep " $TAG\$" SHA256SUMS | shasum -a 256 -c -)
mkdir -p "$out_dir"
mv "$work_dir/$TAG" "$out_dir/valkey-server"
chmod 755 "$out_dir/valkey-server"

echo "✓ build/valkey-android/$VALKEY_VERSION/valkey-server ($(du -h "$out_dir/valkey-server" | cut -f1))"

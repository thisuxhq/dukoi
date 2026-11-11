#!/usr/bin/env bash
# Downloads our prebuilt cloudflared for Android from the GitHub Release.
# Use this for app builds. Only rebuild it (build-cloudflared-android.sh)
# when upgrading cloudflared.
#
# Usage: scripts/fetch-cloudflared.sh [version]
# Output: build/cloudflared-android/<version>/cloudflared
# Needs:  gh (GitHub CLI), signed in with access to thisuxhq/dukoi
set -euo pipefail

CF_VERSION="${1:-2026.10.7}"
REPO=thisuxhq/dukoi
TAG="cloudflared-$CF_VERSION-android-arm64"
ASSET="$TAG.xz"

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
out_dir="$repo_dir/build/cloudflared-android/$CF_VERSION"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

if [ -x "$out_dir/cloudflared" ] && [ "$(file -b "$out_dir/cloudflared" | grep -c 'ARM aarch64')" = 1 ]; then
  echo "✓ Already have build/cloudflared-android/$CF_VERSION/cloudflared"
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
mv "$work_dir/$TAG" "$out_dir/cloudflared"
chmod 755 "$out_dir/cloudflared"

echo "✓ build/cloudflared-android/$CF_VERSION/cloudflared ($(du -h "$out_dir/cloudflared" | cut -f1))"

#!/usr/bin/env bash
# Downloads the prebuilt Node.js for Android from our GitHub Release.
# Use this for app builds. Only rebuild Node (build-node-android-native.sh)
# when upgrading to a new Node version.
#
# Usage: scripts/fetch-node.sh [node-version]
# Output: build/node-android/<version>/node
# Needs:  gh (GitHub CLI), signed in with access to thisuxhq/dukoi
set -euo pipefail

NODE_VERSION="${1:-v24.22.2}"
REPO=thisuxhq/dukoi
TAG="node-$NODE_VERSION-android-arm64"
ASSET="$TAG.xz"

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
out_dir="$repo_dir/build/node-android/$NODE_VERSION"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

if [ -x "$out_dir/node" ] && [ "$(file -b "$out_dir/node" | grep -c 'ARM aarch64')" = 1 ]; then
  echo "✓ Already have build/node-android/$NODE_VERSION/node"
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
mv "$work_dir/$TAG" "$out_dir/node"
chmod 755 "$out_dir/node"

echo "✓ build/node-android/$NODE_VERSION/node ($(du -h "$out_dir/node" | cut -f1))"

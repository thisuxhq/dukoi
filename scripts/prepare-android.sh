#!/usr/bin/env bash
# Puts everything the phone app bundles into android/app/src/main:
#   jniLibs/arm64-v8a/libnode.so          prebuilt Node for Android (fetch-node.sh)
#   jniLibs/arm64-v8a/libcloudflared.so   prebuilt cloudflared for Android (fetch-cloudflared.sh)
#   assets/agent/agent.mjs         the phone agent, bundled for Node with bun build
#   assets/templates/<id>.tgz      the templates for Try a template (pack-templates.ts)
#
# Usage: scripts/prepare-android.sh
# Run it before ./gradlew assembleDebug. It's quick after the first run.
set -euo pipefail

NODE_VERSION=v24.22.2
CF_VERSION=2026.10.7
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
main="$repo_dir/android/app/src/main"

"$repo_dir/scripts/fetch-node.sh" "$NODE_VERSION"
mkdir -p "$main/jniLibs/arm64-v8a"
if ! cmp -s "$repo_dir/build/node-android/$NODE_VERSION/node" "$main/jniLibs/arm64-v8a/libnode.so"; then
  cp "$repo_dir/build/node-android/$NODE_VERSION/node" "$main/jniLibs/arm64-v8a/libnode.so"
fi
echo "✓ Node $NODE_VERSION → jniLibs/arm64-v8a/libnode.so"

"$repo_dir/scripts/fetch-cloudflared.sh" "$CF_VERSION"
if ! cmp -s "$repo_dir/build/cloudflared-android/$CF_VERSION/cloudflared" "$main/jniLibs/arm64-v8a/libcloudflared.so"; then
  cp "$repo_dir/build/cloudflared-android/$CF_VERSION/cloudflared" "$main/jniLibs/arm64-v8a/libcloudflared.so"
fi
echo "✓ cloudflared $CF_VERSION → jniLibs/arm64-v8a/libcloudflared.so"

(cd "$repo_dir/agent" && bun run build >/dev/null)
mkdir -p "$main/assets/agent"
cp "$repo_dir/agent/dist/agent.mjs" "$main/assets/agent/agent.mjs"
echo "✓ Agent → assets/agent/agent.mjs"

bun "$repo_dir/scripts/pack-templates.ts" >/dev/null
rm -rf "$main/assets/templates"
mkdir -p "$main/assets/templates"
cp "$repo_dir"/build/templates/*.tgz "$main/assets/templates/"
echo "✓ Templates → assets/templates/"

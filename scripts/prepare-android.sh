#!/usr/bin/env bash
# Puts everything the phone app bundles into android/app/src/main:
#   jniLibs/arm64-v8a/libnode.so          prebuilt Node for Android (fetch-node.sh)
#   jniLibs/arm64-v8a/libcloudflared.so   prebuilt cloudflared for Android (fetch-cloudflared.sh)
#   jniLibs/arm64-v8a/libvalkey.so        prebuilt Valkey (Redis) for Android (fetch-valkey.sh)
#   assets/agent/agent.mjs         the phone agent, bundled for Node with bun build
#   assets/postgres/               Postgres (PGlite): postgres.mjs and its .wasm and .data files
#   assets/templates/<id>.tgz      the templates for Try a template (pack-templates.ts)
#
# Usage: scripts/prepare-android.sh
# Run it before ./gradlew assembleDebug. It's quick after the first run.
set -euo pipefail

NODE_VERSION=v24.22.2
CF_VERSION=2026.10.7
VALKEY_VERSION=9.1.3
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

"$repo_dir/scripts/fetch-valkey.sh" "$VALKEY_VERSION"
if ! cmp -s "$repo_dir/build/valkey-android/$VALKEY_VERSION/valkey-server" "$main/jniLibs/arm64-v8a/libvalkey.so"; then
  cp "$repo_dir/build/valkey-android/$VALKEY_VERSION/valkey-server" "$main/jniLibs/arm64-v8a/libvalkey.so"
fi
echo "✓ Valkey $VALKEY_VERSION → jniLibs/arm64-v8a/libvalkey.so"

(cd "$repo_dir/agent" && bun run build >/dev/null)
mkdir -p "$main/assets/agent"
cp "$repo_dir/agent/dist/agent.mjs" "$main/assets/agent/agent.mjs"
echo "✓ Agent → assets/agent/agent.mjs"
rm -rf "$main/assets/postgres"
mkdir -p "$main/assets/postgres"
cp "$repo_dir"/agent/dist/postgres/* "$main/assets/postgres/"
echo "✓ Postgres (PGlite) → assets/postgres/"

bun "$repo_dir/scripts/pack-templates.ts" >/dev/null
rm -rf "$main/assets/templates"
mkdir -p "$main/assets/templates"
cp "$repo_dir"/build/templates/*.tgz "$main/assets/templates/"
echo "✓ Templates → assets/templates/"

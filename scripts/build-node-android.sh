#!/usr/bin/env bash
# Builds Node.js for Android arm64 from the official source, using Google's NDK.
#
# Usage: scripts/build-node-android.sh [node-version]
#   node-version  defaults to the version below, for example v24.22.2
#
# Output: build/node-android/<version>/node  (an arm64 Android executable)
# Then:   spikes/node-survival/scripts/install-node.sh build/node-android/<version>/node
#
# Needs: the Android NDK (android sdk install ndk/<version>), Python 3, make, Xcode tools.
# Takes 30 to 60 minutes on an 8-core Mac. Reruns reuse the existing build.
set -euo pipefail

NODE_VERSION="${1:-v24.22.2}"
ANDROID_API=29            # our minSdk (Android 10)
SDK_DIR="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
NDK_DIR="${ANDROID_NDK_HOME:-$(ls -d "$SDK_DIR"/ndk/* 2>/dev/null | sort -V | tail -1)}"

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
src_root="$repo_dir/build/node-src"
src_dir="$src_root/node-$NODE_VERSION"
out_dir="$repo_dir/build/node-android/$NODE_VERSION"

step() { printf '\n\033[1m→ %s\033[0m\n' "$1"; }

if [ -z "$NDK_DIR" ] || [ ! -d "$NDK_DIR" ]; then
  echo "✗ No Android NDK found in $SDK_DIR/ndk." >&2
  echo "  Install one: android sdk install ndk/29.0.14206865" >&2
  exit 1
fi
echo "Node $NODE_VERSION, NDK $(basename "$NDK_DIR"), Android API $ANDROID_API"

mkdir -p "$src_root" "$out_dir"

if [ ! -d "$src_dir" ]; then
  step "Downloading official source from nodejs.org"
  cd "$src_root"
  curl -fsSLO "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION.tar.xz"
  curl -fsSL -o "SHASUMS256-$NODE_VERSION.txt" "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt"
  grep " node-$NODE_VERSION.tar.xz\$" "SHASUMS256-$NODE_VERSION.txt" | shasum -a 256 -c -
  tar xf "node-$NODE_VERSION.tar.xz"
fi

cd "$src_dir"

if [ ! -f config.gypi ]; then
  step "Configuring for Android arm64"
  # android-configure's V8 trap-handler patch is Linux-only and isn't needed on
  # an arm64 Mac: V8 already disables the trap handler for native arm64 Android.
  ./android-configure "$NDK_DIR" "$ANDROID_API" arm64
fi

step "Building (this is the long part)"
make -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc)"

step "Copying and stripping"
cp out/Release/node "$out_dir/node"
"$NDK_DIR/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-strip" "$out_dir/node"

echo
echo "✓ $out_dir/node ($(du -h "$out_dir/node" | cut -f1))"
file -b "$out_dir/node"
echo
echo "Libraries it needs on the phone:"
"$NDK_DIR/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-readelf" -d "$out_dir/node" | grep NEEDED || echo "  none"

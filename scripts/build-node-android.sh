#!/usr/bin/env bash
# Builds Node.js for Android arm64 from the official source, using Google's NDK.
#
# Usage: scripts/build-node-android.sh [node-version]
#   node-version  defaults to v24.22.2
#
# Output: build/node-android/<version>/node  (an arm64 Android executable)
# Then:   spikes/node-survival/scripts/install-node.sh build/node-android/<version>/node
#
# Node's Android build only works on a Linux host. Its Makefile passes GNU
# linker flags (--start-group) that macOS's linker rejects. So on a Mac this
# script runs the build inside a Linux container (Docker or OrbStack). On Linux
# it builds directly.
#
# Takes about an hour. Reruns reuse the existing build.
set -euo pipefail

NODE_VERSION="${1:-v24.22.2}"
ANDROID_API=29                 # our minSdk (Android 10)
NDK_RELEASE=r29                # 29.0.14206865
NDK_ZIP="android-ndk-$NDK_RELEASE-linux.zip"

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
step() { printf '\n\033[1m→ %s\033[0m\n' "$1"; }

# ── On a Mac: hand over to a Linux container ────────────────────────────────
if [ "$(uname -s)" = "Darwin" ]; then
  if ! docker info >/dev/null 2>&1; then
    echo "✗ Docker isn't running. Start OrbStack or Docker Desktop, then run this again." >&2
    exit 1
  fi
  step "Building inside a Linux container (linux/amd64, because the NDK ships x86_64 Linux tools)"
  # The NDK and the build tree live on a Docker volume: a case-sensitive Linux
  # filesystem (the NDK has files whose names differ only by case) that is
  # also much faster to compile on than a folder shared with macOS.
  # Run detached, so the build keeps going if this terminal closes.
  # Watch it with: docker logs -f dukoi-node-build
  docker rm -f dukoi-node-build >/dev/null 2>&1 || true
  docker run -d --name dukoi-node-build --platform linux/amd64 \
    -v dukoi-node-build:/cache \
    -v "$repo_dir/build:/work/build" \
    -v "$repo_dir/scripts:/work/scripts:ro" \
    -e IN_CONTAINER=1 \
    ubuntu:24.04 \
    bash /work/scripts/build-node-android.sh "$NODE_VERSION" >/dev/null
  echo "Started. Following the log (Ctrl-C stops watching, not the build)."
  docker logs -f dukoi-node-build || true
  exit "$(docker wait dukoi-node-build)"
fi

# ── On Linux: build ─────────────────────────────────────────────────────────
if [ "${IN_CONTAINER:-}" = "1" ]; then
  work_dir=/work
  cache_dir=/cache
  step "Installing build tools"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends \
    python3 make g++ curl ca-certificates unzip xz-utils file >/dev/null
else
  work_dir="$repo_dir"
  cache_dir="$repo_dir/build"
fi

src_root="$cache_dir/node-src"
src_dir="$src_root/node-$NODE_VERSION-linux"   # separate from any macOS attempt
out_dir="$work_dir/build/node-android/$NODE_VERSION"
ndk_root="$cache_dir/ndk"
NDK_DIR="${ANDROID_NDK_HOME:-$ndk_root/android-ndk-$NDK_RELEASE}"
mkdir -p "$src_root" "$out_dir" "$ndk_root"

if [ ! -d "$NDK_DIR" ]; then
  step "Downloading Android NDK $NDK_RELEASE from dl.google.com"
  curl -fSL -o "$ndk_root/$NDK_ZIP" "https://dl.google.com/android/repository/$NDK_ZIP"
  unzip -q "$ndk_root/$NDK_ZIP" -d "$ndk_root"
  rm "$ndk_root/$NDK_ZIP"
fi
TOOLS="$NDK_DIR/toolchains/llvm/prebuilt/linux-x86_64/bin"

tarball="$src_root/node-$NODE_VERSION.tar.xz"
if [ ! -f "$tarball" ]; then
  step "Downloading official Node source from nodejs.org"
  curl -fsSL -o "$tarball" "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION.tar.xz"
fi
step "Checking the source against nodejs.org's SHA-256 list"
curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" \
  | grep " node-$NODE_VERSION.tar.xz\$" \
  | sed "s# node-# $src_root/node-#" \
  | sha256sum -c -

if [ ! -d "$src_dir" ]; then
  mkdir -p "$src_dir"
  tar xf "$tarball" -C "$src_dir" --strip-components=1
fi
cd "$src_dir"

# zlib's Android code path calls android_getCpuFeatures() from the NDK's old
# cpufeatures helper, which Node's build never links. Android 10+ has the
# standard Linux getauxval(), so build zlib's Linux path instead.
if grep -q "'ARMV8_OS_ANDROID'" deps/zlib/zlib.gyp; then
  step "Patching zlib to detect CPU features the Linux way"
  sed -i "s/'ARMV8_OS_ANDROID'/'ARMV8_OS_LINUX'/g" deps/zlib/zlib.gyp
  rm -f config.gypi   # reconfigure so the change takes effect
fi

if [ ! -f config.gypi ]; then
  step "Configuring for Android arm64, API $ANDROID_API"
  ./android-configure patch || true      # V8 trap-handler patch (may already be applied upstream)
  # Host tools (torque, mksnapshot, icupkg) run on this machine during the
  # build, so they need the normal compiler, not the Android one.
  CC_host=gcc CXX_host=g++ ./android-configure "$NDK_DIR" "$ANDROID_API" arm64
fi

step "Building (the long part)"
make -j"$(nproc)"

step "Copying and stripping"
cp out/Release/node "$out_dir/node"
"$TOOLS/llvm-strip" "$out_dir/node"

echo
echo "✓ build/node-android/$NODE_VERSION/node ($(du -h "$out_dir/node" | cut -f1))"
file -b "$out_dir/node"
echo
echo "Libraries it needs on the phone:"
"$TOOLS/llvm-readelf" -d "$out_dir/node" | grep NEEDED || echo "  none"

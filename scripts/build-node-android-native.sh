#!/usr/bin/env bash
# Faster Node.js-for-Android build for Apple Silicon Macs. Experimental.
#
# Usage: scripts/build-node-android-native.sh [node-version]
#
# scripts/build-node-android.sh uses Google's NDK compiler, which only ships
# for x86_64 Linux, so on an ARM Mac the whole build runs under emulation and
# takes hours. This script runs an arm64 Linux container instead and compiles
# with upstream Clang 21 (the version the NDK's Clang is based on), using the
# NDK only for its Android headers, libraries and compiler runtime.
#
# Output: build/node-android/<version>-native/node
set -euo pipefail

NODE_VERSION="${1:-v24.22.2}"
ANDROID_API=29
LLVM_VERSION=21                 # matches NDK r29's clang
NDK_RELEASE=r29

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
step() { printf '\n\033[1m→ %s\033[0m\n' "$1"; }

# ── On a Mac: hand over to an arm64 Linux container ─────────────────────────
if [ "$(uname -s)" = "Darwin" ]; then
  docker info >/dev/null 2>&1 || { echo "✗ Docker isn't running. Start OrbStack." >&2; exit 1; }
  docker rm -f dukoi-node-native >/dev/null 2>&1 || true
  # Reuse an image with the tools already installed, if a past run saved one.
  image=ubuntu:24.04
  docker image inspect dukoi-native-tools:llvm21 >/dev/null 2>&1 && image=dukoi-native-tools:llvm21
  # The dukoi-node-native volume keeps the NDK, Node source and build tree,
  # so upgrading to a new Node version only recompiles what changed.
  docker run -d --name dukoi-node-native --platform linux/arm64 \
    -v dukoi-node-native:/cache \
    -v "$repo_dir/build:/work/build" \
    -v "$repo_dir/scripts:/work/scripts:ro" \
    -e IN_CONTAINER=1 \
    "$image" \
    bash /work/scripts/build-node-android-native.sh "$NODE_VERSION" >/dev/null
  echo "Started. Following the log (Ctrl-C stops watching, not the build)."
  docker logs -f dukoi-node-native || true
  exit "$(docker wait dukoi-node-native)"
fi

[ "${IN_CONTAINER:-}" = "1" ] || { echo "✗ Run this on a Mac (it starts its own container)." >&2; exit 1; }

NDK_DIR=/cache/ndk/android-ndk-$NDK_RELEASE
NDK_TC=$NDK_DIR/toolchains/llvm/prebuilt/linux-x86_64

if ! command -v clang-$LLVM_VERSION >/dev/null; then
  step "Installing build tools and LLVM $LLVM_VERSION (native arm64)"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends \
    python3 make g++ curl ca-certificates xz-utils file wget unzip gnupg lsb-release software-properties-common >/dev/null
  wget -qO /tmp/llvm.sh https://apt.llvm.org/llvm.sh
  bash /tmp/llvm.sh $LLVM_VERSION >/dev/null
fi

# The NDK is only used for its Android headers, libraries and runtime, which
# are plain files, so its x86_64 Linux download works on arm64 too.
if [ ! -d "$NDK_TC/sysroot" ]; then
  step "Downloading Android NDK $NDK_RELEASE from dl.google.com"
  command -v unzip >/dev/null || apt-get install -y -qq unzip >/dev/null
  mkdir -p /cache/ndk
  curl -fSL -o /cache/ndk/ndk.zip "https://dl.google.com/android/repository/android-ndk-$NDK_RELEASE-linux.zip"
  unzip -q /cache/ndk/ndk.zip -d /cache/ndk
  rm /cache/ndk/ndk.zip
fi

# Upstream clang keeps its own built-in headers (the NDK's are from Google's
# clang fork and don't match). It only needs the NDK's Android runtime
# libraries (libclang_rt.*-android, libunwind) in its resource directory.
clang_rt=$(clang-$LLVM_VERSION -print-resource-dir)/lib/linux
mkdir -p "$clang_rt"
cp -rn "$NDK_TC/lib/clang/$LLVM_VERSION/lib/linux/." "$clang_rt/"

# Compiler wrappers: upstream clang aimed at Android, with the NDK's sysroot
# (Android headers, libc, libc++). Android links LLVM's runtime (compiler-rt,
# libunwind), not GCC's, and libc++ statically, like the NDK's own clang does.
mkdir -p /cache/bin
for tool in clang clang++; do
  cat > /cache/bin/android-$tool <<EOF
#!/bin/sh
exec $tool-$LLVM_VERSION --target=aarch64-linux-android$ANDROID_API \\
  --sysroot=$NDK_TC/sysroot \\
  -fuse-ld=lld -rtlib=compiler-rt -unwindlib=libunwind -static-libstdc++ "\$@"
EOF
  chmod +x /cache/bin/android-$tool
done

src_root=/cache/node-src
src_dir=$src_root/node-$NODE_VERSION
out_dir=/work/build/node-android/$NODE_VERSION-native
mkdir -p "$src_root" "$out_dir"

tarball=$src_root/node-$NODE_VERSION.tar.xz
if [ ! -f "$tarball" ]; then
  step "Downloading official Node source from nodejs.org"
  curl -fsSL -o "$tarball" "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION.tar.xz"
fi
step "Checking the source against nodejs.org's SHA-256 list"
curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" \
  | grep " node-$NODE_VERSION.tar.xz\$" | sed "s# node-# $src_root/node-#" | sha256sum -c -

if [ ! -d "$src_dir" ]; then
  mkdir -p "$src_dir"
  tar xf "$tarball" -C "$src_dir" --strip-components=1
fi
cd "$src_dir"

# Same zlib fix as build-node-android.sh: use getauxval(), not the NDK's
# cpufeatures helper that Node never links.
if grep -q "'ARMV8_OS_ANDROID'" deps/zlib/zlib.gyp; then
  step "Patching zlib to detect CPU features the Linux way"
  sed -i "s/'ARMV8_OS_ANDROID'/'ARMV8_OS_LINUX'/g" deps/zlib/zlib.gyp
  rm -f config.gypi
fi

# V8's trap handler (a WebAssembly speed-up). On an arm64 Linux build machine
# the header turns it on for the host tools, but with OS=android the build
# never compiles its code, so mksnapshot fails to link. Node's own
# android-patches/trap-handler.h.patch turns it off; that patch no longer
# applies cleanly, so do the same thing directly. Android already has it off.
th=deps/v8/src/trap-handler/trap-handler.h
if ! grep -q "Dukoi: trap handler off" "$th"; then
  step "Patching V8 to turn off the trap handler (as Node's Android patch does)"
  sed -i 's|^#if V8_OS_ANDROID && V8_TRAP_HANDLER_SUPPORTED|// Dukoi: trap handler off (see android-patches/trap-handler.h.patch)\n#undef V8_TRAP_HANDLER_SUPPORTED\n#define V8_TRAP_HANDLER_SUPPORTED false\n\n&|' "$th"
  grep -q "Dukoi: trap handler off" "$th" || { echo "✗ Couldn't patch $th" >&2; exit 1; }
fi

if [ ! -f config.gypi ]; then
  step "Configuring for Android arm64, API $ANDROID_API"
  # What android-configure does, with our compiler instead of the NDK's.
  export CC=/cache/bin/android-clang CXX=/cache/bin/android-clang++
  export CC_host=gcc CXX_host=g++
  export AR=llvm-ar-$LLVM_VERSION
  export GYP_DEFINES="target_arch=arm64 v8_target_arch=arm64 android_target_arch=arm64 host_os=linux OS=android android_ndk_path=$NDK_DIR"
  ./configure --dest-cpu=arm64 --dest-os=android --openssl-no-asm --cross-compiling
fi

step "Building (native, should be much faster)"
make -j"$(nproc)" "AR.target=llvm-ar-$LLVM_VERSION" "AR.host=ar"

step "Copying and stripping"
cp out/Release/node "$out_dir/node"
llvm-strip-$LLVM_VERSION "$out_dir/node"

echo
echo "✓ build/node-android/$NODE_VERSION-native/node ($(du -h "$out_dir/node" | cut -f1))"
file -b "$out_dir/node"
echo
echo "Libraries it needs on the phone:"
llvm-readelf-$LLVM_VERSION -d "$out_dir/node" | grep NEEDED || echo "  none"

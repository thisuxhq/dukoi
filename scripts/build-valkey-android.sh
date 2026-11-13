#!/usr/bin/env bash
# Builds Valkey (the BSD-licensed Redis) for Android arm64 from its official source.
#
# Usage: scripts/build-valkey-android.sh [valkey-version]
# Output: build/valkey-android/<version>/valkey-server
# Needs:  the Android NDK on this Mac (Android Studio's SDK Manager, or
#         `android sdk install "ndk;29.0.14206865"`). Takes about a minute.
#
# Why not Valkey's own Linux build? It's linked against glibc. Android has its
# own C library (bionic), so the binary has to be built with the NDK. Three
# small changes make Valkey's Linux build work with bionic:
#   - bionic has no pthread_cancel. Valkey only uses it on crash reports and
#     when shutting down extra I/O threads, which we don't turn on, so a stub
#     that says "not supported" is enough (android-compat.h below).
#   - setproctitle.c uses glibc's program_invocation_name; skip that on Android.
#   - bionic has no separate librt, so the link step gets an empty one.
# We use Valkey rather than Redis 8 because Redis 8 is AGPL/SSPL (D-120).
set -euo pipefail

VALKEY_VERSION="${1:-9.1.3}"
VALKEY_SHA256=184e34ed2d9b51879b682b5b15205e2b9d677c60280e3cb453be8f520d04e293
NDK_VERSION=29.0.14206865
ANDROID_API=29

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
step() { printf '\n\033[1m→ %s\033[0m\n' "$1"; }

sdk="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
ndk="${ANDROID_NDK_HOME:-$sdk/ndk/$NDK_VERSION}"
host_tag="$(ls "$ndk/toolchains/llvm/prebuilt" 2>/dev/null | head -1)"
tc="$ndk/toolchains/llvm/prebuilt/$host_tag/bin"
[ -x "$tc/aarch64-linux-android$ANDROID_API-clang" ] || {
  echo "✗ Needs the Android NDK $NDK_VERSION. Install it: android sdk install \"ndk;$NDK_VERSION\"" >&2
  exit 1
}

out_dir="$repo_dir/build/valkey-android/$VALKEY_VERSION"
work="$repo_dir/build/valkey-src"
src="$work/valkey-$VALKEY_VERSION"
mkdir -p "$work" "$out_dir"

if [ ! -d "$src" ]; then
  step "Downloading Valkey $VALKEY_VERSION source from GitHub"
  curl -fsSL -o "$work/valkey.tgz" "https://github.com/valkey-io/valkey/archive/refs/tags/$VALKEY_VERSION.tar.gz"
  echo "$VALKEY_SHA256  $work/valkey.tgz" | shasum -a 256 -c -
  tar xzf "$work/valkey.tgz" -C "$work"
  rm "$work/valkey.tgz"
fi

step "Making Valkey's Linux build work with Android's C library"
cat > "$work/android-compat.h" <<'EOF'
#pragma once
#include <pthread.h>
#include <errno.h>
#ifndef PTHREAD_CANCEL_ENABLE
#define PTHREAD_CANCEL_ENABLE 0
#define PTHREAD_CANCEL_ASYNCHRONOUS 0
static inline int pthread_cancel(pthread_t t) { (void)t; return ESRCH; }
static inline int pthread_setcancelstate(int s, int *o) { (void)s; if (o) *o = 0; return 0; }
static inline int pthread_setcanceltype(int s, int *o) { (void)s; if (o) *o = 0; return 0; }
static inline void pthread_testcancel(void) {}
#endif
EOF
sed -i.orig 's/^#if defined __linux__$/#if defined __linux__ \&\& !defined __ANDROID__/' "$src/src/setproctitle.c"
mkdir -p "$work/stubs"
"$tc/llvm-ar" rcs "$work/stubs/librt.a"

step "Building valkey-server for Android arm64 (API $ANDROID_API)"
make -C "$src" -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc)" valkey-server \
  uname_S=Linux uname_M=aarch64 MALLOC=libc BUILD_TLS=no USE_SYSTEMD=no \
  CC="$tc/aarch64-linux-android$ANDROID_API-clang" AR="$tc/llvm-ar" RANLIB="$tc/llvm-ranlib" \
  CFLAGS="-D_GNU_SOURCE -include $work/android-compat.h" LDFLAGS="-L$work/stubs" >"$work/build.log" 2>&1 \
  || { tail -30 "$work/build.log"; echo "✗ Build failed. Full log: build/valkey-src/build.log" >&2; exit 1; }

"$tc/llvm-strip" -o "$out_dir/valkey-server" "$src/src/valkey-server"
chmod 755 "$out_dir/valkey-server"

echo
echo "✓ build/valkey-android/$VALKEY_VERSION/valkey-server ($(du -h "$out_dir/valkey-server" | cut -f1))"
file -b "$out_dir/valkey-server" 2>/dev/null || true

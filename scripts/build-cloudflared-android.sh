#!/usr/bin/env bash
# Builds cloudflared for Android arm64 from Cloudflare's official source.
#
# Usage: scripts/build-cloudflared-android.sh [cloudflared-version]
# Output: build/cloudflared-android/<version>/cloudflared
#
# Why not use Cloudflare's linux-arm64 release? It's a static Linux build whose
# DNS reads /etc/resolv.conf. Android has no such file, so every lookup fails
# ("lookup api.trycloudflare.com on [::1]:53: connection refused"). Building
# with GOOS=android and cgo makes Go use Android's own resolver, like Node does.
#
# Runs in the same arm64 Linux container as build-node-android-native.sh and
# reuses its Clang 21 and NDK. Takes a few minutes.
set -euo pipefail

CF_VERSION="${1:-2026.10.7}"
GO_VERSION=1.27.4
GO_SHA256=3392582988a273a87ab5043ee1b2c9c17a2c3c00580bf9326c47a2e0aaaeac92   # go.dev, linux-arm64
ANDROID_API=29
LLVM_VERSION=21
NDK_RELEASE=r29

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
step() { printf '\n\033[1m→ %s\033[0m\n' "$1"; }

# ── On a Mac: run inside the arm64 Linux container ──────────────────────────
if [ "$(uname -s)" = "Darwin" ]; then
  docker info >/dev/null 2>&1 || { echo "✗ Docker isn't running. Start OrbStack." >&2; exit 1; }
  image=ubuntu:24.04
  docker image inspect droidhost-native-tools:llvm21 >/dev/null 2>&1 && image=droidhost-native-tools:llvm21
  exec docker run --rm --platform linux/arm64 \
    -v droidhost-node-native:/cache \
    -v "$repo_dir/build:/work/build" \
    -v "$repo_dir/scripts:/work/scripts:ro" \
    -e IN_CONTAINER=1 \
    "$image" \
    bash /work/scripts/build-cloudflared-android.sh "$CF_VERSION"
fi

[ "${IN_CONTAINER:-}" = "1" ] || { echo "✗ Run this on a Mac (it starts its own container)." >&2; exit 1; }

NDK_TC=/cache/ndk/android-ndk-$NDK_RELEASE/toolchains/llvm/prebuilt/linux-x86_64
if ! command -v clang-$LLVM_VERSION >/dev/null || [ ! -d "$NDK_TC/sysroot" ]; then
  echo "✗ Needs Clang $LLVM_VERSION and the NDK. Run scripts/build-node-android-native.sh once first." >&2
  exit 1
fi

if [ ! -x /cache/go/bin/go ] || ! /cache/go/bin/go version | grep -q "go$GO_VERSION "; then
  step "Downloading Go $GO_VERSION from go.dev"
  curl -fsSL -o /tmp/go.tgz "https://go.dev/dl/go$GO_VERSION.linux-arm64.tar.gz"
  echo "$GO_SHA256  /tmp/go.tgz" | sha256sum -c -
  rm -rf /cache/go && tar xzf /tmp/go.tgz -C /cache
fi
export PATH=/cache/go/bin:$PATH GOPATH=/cache/gopath GOCACHE=/cache/gocache

src=/cache/cloudflared-src/$CF_VERSION
if [ ! -d "$src" ]; then
  step "Downloading cloudflared $CF_VERSION source from GitHub"
  mkdir -p "$src"
  curl -fsSL "https://github.com/cloudflare/cloudflared/archive/refs/tags/$CF_VERSION.tar.gz" | tar xz -C "$src" --strip-components=1
fi
cd "$src"

step "Building cloudflared for Android arm64 (cgo, Android's DNS resolver)"
cat > /tmp/android-cc <<EOF
#!/bin/sh
exec clang-$LLVM_VERSION --target=aarch64-linux-android$ANDROID_API --sysroot=$NDK_TC/sysroot -fuse-ld=lld -rtlib=compiler-rt -unwindlib=libunwind -Wno-unused-command-line-argument "\$@"
EOF
chmod +x /tmp/android-cc
GOOS=android GOARCH=arm64 CGO_ENABLED=1 CC=/tmp/android-cc \
  go build -trimpath -ldflags "-s -w -X main.Version=$CF_VERSION -X main.BuildTime=$(date -u +%Y-%m-%d)" \
  -o /work/build/cloudflared-android/$CF_VERSION/cloudflared ./cmd/cloudflared

out=/work/build/cloudflared-android/$CF_VERSION/cloudflared
echo
echo "✓ build/cloudflared-android/$CF_VERSION/cloudflared ($(du -h "$out" | cut -f1))"
file -b "$out" 2>/dev/null || true

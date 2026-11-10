#!/usr/bin/env bash
# Copies an Android arm64 Node binary into the APK as jniLibs/arm64-v8a/libnode.so.
#
# Usage: scripts/install-node.sh <path-to-node-binary>
#
# Android 10+ only lets apps run binaries from nativeLibraryDir, and only files
# named lib*.so land there. So the `node` executable ships renamed as libnode.so.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path-to-node-binary>" >&2
  exit 2
fi

source_binary="$1"
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
target_dir="$project_dir/app/src/main/jniLibs/arm64-v8a"

if [ ! -f "$source_binary" ]; then
  echo "✗ No file at $source_binary" >&2
  exit 1
fi

kind="$(file -b "$source_binary")"
case "$kind" in
  *ELF*64-bit*ARM\ aarch64*) ;;
  *)
    echo "✗ That isn't an arm64 Linux/Android binary." >&2
    echo "  file says: $kind" >&2
    exit 1
    ;;
esac

mkdir -p "$target_dir"
cp "$source_binary" "$target_dir/libnode.so"
chmod 755 "$target_dir/libnode.so"

echo "✓ Installed Node as $target_dir/libnode.so ($(du -h "$target_dir/libnode.so" | cut -f1))"
echo "  sha256 $(shasum -a 256 "$target_dir/libnode.so" | cut -d' ' -f1)"
echo
case "$kind" in
  *statically\ linked*) echo "  Static binary. Good: no extra libraries needed." ;;
  *)
    echo "  ⚠ Dynamically linked. Check its libraries are on every Android phone:"
    echo "    readelf -d $source_binary | grep NEEDED"
    ;;
esac

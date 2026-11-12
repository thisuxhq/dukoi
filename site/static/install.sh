#!/bin/sh
# Installs the dukoi command on macOS and Linux:
#
#   curl -fsSL https://dukoi.com/install | sh
#
# Puts the CLI, the dashboard and the templates in ~/.dukoi, checks the
# download against SHA256SUMS and adds ~/.dukoi/bin to your PATH. Never uses
# sudo. Run it again to update. Built by scripts/build-cli.ts (D-113).
# Then installs the Dukoi skill for the coding agents it finds (D-117).
set -eu

BASE="${DUKOI_DOWNLOAD:-https://dukoi.com/download}"
DIR="${DUKOI_INSTALL:-$HOME/.dukoi}"

fail() {
  printf '✗ %s\n' "$1" >&2
  exit 1
}

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) fail "This script is for macOS and Linux. On Windows, run this in PowerShell: irm https://dukoi.com/install.ps1 | iex" ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) fail "Dukoi's CLI runs on 64-bit Intel and ARM computers, not $(uname -m)." ;;
esac

# A Terminal running under Rosetta reports x64 on an Apple Silicon Mac
if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then
  arch=arm64
fi

command -v curl >/dev/null || fail "This needs curl. Install it, then run this again."
command -v tar >/dev/null || fail "This needs tar. Install it, then run this again."

file="dukoi-$os-$arch.tar.gz"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

printf '→ Downloading %s\n' "$file"
curl -fsSL "$BASE/$file" -o "$tmp/$file" ||
  fail "Couldn't download $BASE/$file. Check your connection and try again."
curl -fsSL "$BASE/SHA256SUMS" -o "$tmp/SHA256SUMS" ||
  fail "Couldn't download $BASE/SHA256SUMS. Check your connection and try again."

expected="$(grep "  $file\$" "$tmp/SHA256SUMS" | cut -d' ' -f1)"
if command -v sha256sum >/dev/null; then
  actual="$(sha256sum "$tmp/$file" | cut -d' ' -f1)"
else
  actual="$(shasum -a 256 "$tmp/$file" | cut -d' ' -f1)"
fi
[ -n "$expected" ] && [ "$expected" = "$actual" ] ||
  fail "The download doesn't match its checksum, so nothing was installed. Try again."

mkdir -p "$tmp/new"
tar -xzf "$tmp/$file" -C "$tmp/new"
# Replace only what the archive holds, so anything else in ~/.dukoi stays
mkdir -p "$DIR"
rm -rf "$DIR/bin" "$DIR/dashboard" "$DIR/starters" "$DIR/skills"
mv "$tmp/new/bin" "$tmp/new/dashboard" "$tmp/new/starters" "$DIR/"
# Releases before 0.3.0 have no skills folder
if [ -d "$tmp/new/skills" ]; then mv "$tmp/new/skills" "$DIR/"; fi

# Dukoi 0.1.0 shipped with a broken signature, and Apple Silicon Macs kill a
# program whose signature doesn't match. Sign it again on this Mac if so.
if [ "$os" = darwin ] && command -v codesign >/dev/null &&
  ! codesign --verify --strict "$DIR/bin/dukoi" 2>/dev/null; then
  codesign --force --sign - --identifier com.dukoi.cli "$DIR/bin/dukoi" 2>/dev/null || true
fi

# Check it starts. Run it on its own: in a pipe, a crash would go unnoticed.
version="$("$DIR/bin/dukoi" --version 2>/dev/null)" ||
  fail "dukoi was installed in $DIR but won't start. Please report it at https://github.com/thisuxhq/dukoi/issues"
version="$(printf '%s' "$version" | cut -d' ' -f2)"
short="$(printf '%s' "$DIR" | sed "s|^$HOME|~|")"
printf '✓ Installed dukoi %s in %s\n' "$version" "$short"

# Teach the coding agents on this computer to use Dukoi. Never fails the install.
if [ -d "$DIR/skills" ]; then
  "$DIR/bin/dukoi" skill --quiet 2>/dev/null || true
fi

# Add ~/.dukoi/bin to PATH in the shell's startup file, once
case ":$PATH:" in
  *":$DIR/bin:"*) on_path=yes ;;
  *) on_path=no ;;
esac
if [ "$on_path" = no ]; then
  # Write $HOME, not the full path, so the line still reads well
  case "$DIR" in
    "$HOME"/*) bin_ref="\$HOME${DIR#"$HOME"}/bin" ;;
    *) bin_ref="$DIR/bin" ;;
  esac
  line="export PATH=\"$bin_ref:\$PATH\""
  case "$(basename "${SHELL:-sh}")" in
    zsh) rc="${ZDOTDIR:-$HOME}/.zshrc" ;;
    bash) if [ "$os" = darwin ]; then rc="$HOME/.bash_profile"; else rc="$HOME/.bashrc"; fi ;;
    fish)
      rc="$HOME/.config/fish/conf.d/dukoi.fish"
      line="fish_add_path \"$bin_ref\""
      mkdir -p "$(dirname "$rc")"
      ;;
    *) rc="$HOME/.profile" ;;
  esac
  if ! grep -qsF "$bin_ref" "$rc"; then
    printf '\n# dukoi\n%s\n' "$line" >>"$rc"
    printf '  Added %s/bin to your PATH in %s\n' "$short" "$(printf '%s' "$rc" | sed "s|^$HOME|~|")"
  fi
  printf '  Open a new terminal, or run: %s\n' "$line"
fi

printf '\n  Next: dukoi pair\n'

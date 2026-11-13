#!/usr/bin/env bash
# Releases a new version of Dukoi: the phone app, the CLI and the site, all at
# the same version. See docs/releasing.md.
#
# Usage: scripts/release.sh 0.2.0            # release for real
#        scripts/release.sh 0.2.0 --dry-run  # build everything, publish nothing
#
# Needs: a clean checkout of the latest main, a "## [0.2.0] - <date>" section in
# CHANGELOG.md, the release key in DUKOI_KEYSTORE and DUKOI_KEYSTORE_PASSWORD,
# wrangler login and gh auth login.
set -euo pipefail

version="${1:-}"
dry_run="${2:-}"
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"

step() { printf '\n→ %s\n' "$1"; }
fail() {
  printf '✗ %s\n' "$1" >&2
  exit 1
}

[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
  fail "Give the version to release, like: scripts/release.sh 0.2.0"
[ -z "$dry_run" ] || [ "$dry_run" = --dry-run ] || fail "The only option is --dry-run."
tag="v$version"

step "Checking the release can start"
[ -z "$(git status --porcelain)" ] || fail "There are uncommitted changes. Commit or stash them first."
if [ -z "$dry_run" ]; then
  git fetch -q origin main
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] ||
    fail "Release from the latest main. Run: git checkout main && git pull"
  [ -n "${DUKOI_KEYSTORE:-}" ] && [ -n "${DUKOI_KEYSTORE_PASSWORD:-}" ] ||
    fail "Set DUKOI_KEYSTORE and DUKOI_KEYSTORE_PASSWORD to sign the APK. See docs/releasing.md."
  [ -f "$DUKOI_KEYSTORE" ] || fail "There's no release key at $DUKOI_KEYSTORE."
fi
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && fail "$tag is already tagged. Pick the next version."
grep -q "^## \[$version\]" CHANGELOG.md ||
  fail "CHANGELOG.md has no \"## [$version] - $(date +%F)\" section. Move the Unreleased notes into one first."

step "Setting the version to $version"
sed -i.bak "s/DUKOI_VERSION = '[^']*'/DUKOI_VERSION = '$version'/" shared/src/version.ts
rm shared/src/version.ts.bak
# A dry run leaves the checkout as it found it
[ -n "$dry_run" ] && trap 'git checkout -q -- shared/src/version.ts' EXIT

step "Running the checks"
bun install --frozen-lockfile >/dev/null
bun test
bun run typecheck >/dev/null
bun run lint >/dev/null
echo "✓ Tests, typecheck and lint pass"

step "Building the phone app"
scripts/prepare-android.sh
(cd android && ./gradlew assembleRelease -q)
apk_dir=android/app/build/outputs/apk/release
apk="$apk_dir/app-release.apk"
[ -f "$apk" ] || apk="$apk_dir/app-release-unsigned.apk"
[ -n "$dry_run" ] || [ "$(basename "$apk")" = app-release.apk ] ||
  fail "The APK wasn't signed. Check DUKOI_KEYSTORE and the passwords."

step "Building the CLI"
bun scripts/build-cli.ts
cp "$apk" build/release/dukoi.apk
(cd build/release && shasum -a 256 dukoi-*.tar.gz dukoi-*.zip dukoi.apk >SHA256SUMS)
echo "$version" >build/release/VERSION
echo "✓ build/release holds the APK, five CLI archives, SHA256SUMS and VERSION"

if [ -n "$dry_run" ]; then
  printf '\n✓ Dry run of %s done. Nothing was committed, pushed or published.\n' "$tag"
  ls -lh build/release
  exit 0
fi

step "Tagging $tag"
if ! git diff --quiet shared/src/version.ts; then
  git commit -q -m "Release $tag" shared/src/version.ts
fi
git tag -a "$tag" -m "Dukoi $version"
git push -q origin HEAD:main "$tag"
echo "✓ Pushed $tag to main"

step "Publishing the downloads"
scripts/publish-release.sh

step "Deploying dukoi.com"
bun run --filter @dukoi/site deploy >/dev/null
echo "✓ Deployed"

step "Creating the GitHub release"
notes="$(awk -v v="$version" '
  $0 ~ "^## \\[" v "\\]" { on = 1; next }
  on && /^## \[/ { exit }
  on && /^\[/ { exit }
  on { print }
' CHANGELOG.md)"
gh release create "$tag" build/release/dukoi.apk --verify-tag --title "Dukoi $version" --notes "$notes"

printf '\n✓ Released Dukoi %s\n' "$version"
printf '  CLI:  curl -fsSL https://dukoi.com/install | sh\n'
printf '  APK:  https://dukoi.com/download/dukoi.apk\n'

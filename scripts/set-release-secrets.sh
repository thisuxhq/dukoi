#!/usr/bin/env bash
# Saves what the Release workflow needs as GitHub repository secrets: the
# release key, its password, and a Cloudflare API token and account ID.
# It asks for the password and the token without showing them, checks both
# work, and never prints a secret. See docs/releasing.md.
#
# Usage: scripts/set-release-secrets.sh
# Needs: gh auth login with admin access to thisuxhq/dukoi, keytool (Java),
#        and the release key at ~/keys/dukoi-release.jks (or set DUKOI_KEYSTORE).
# Run it again to replace the secrets, for example with a new Cloudflare token.
set -euo pipefail

repo=thisuxhq/dukoi
key="${DUKOI_KEYSTORE:-$HOME/keys/dukoi-release.jks}"

fail() {
  printf '✗ %s\n' "$1" >&2
  exit 1
}

command -v gh >/dev/null || fail "Needs the GitHub CLI: brew install gh, then gh auth login"
command -v keytool >/dev/null || fail "Needs keytool, which comes with Java 17"
gh auth status >/dev/null 2>&1 || fail "Sign in to GitHub first: gh auth login"
[ -f "$key" ] || fail "There's no release key at $key. Set DUKOI_KEYSTORE to where it is."

printf 'Saving release secrets for %s\n\n' "$repo"

# The key's password, checked against the key before anything is saved
read -rsp "Release key password (hidden): " DUKOI_KEYSTORE_PASSWORD
echo
export DUKOI_KEYSTORE_PASSWORD
keytool -list -keystore "$key" -storepass:env DUKOI_KEYSTORE_PASSWORD >/dev/null 2>&1 ||
  fail "That password doesn't open $key. Nothing was saved."

# The Cloudflare token, checked with Cloudflare before anything is saved
read -rsp "Cloudflare API token (hidden): " cf_token
echo
[ -n "$cf_token" ] || fail "The token is empty. Nothing was saved."
curl -fsS -m 20 -H "Authorization: Bearer $cf_token" \
  https://api.cloudflare.com/client/v4/user/tokens/verify 2>/dev/null | grep -q '"status":"active"' ||
  fail "Cloudflare didn't accept that token, or it isn't active. Nothing was saved."

read -rp "Cloudflare account ID: " cf_account
[[ "$cf_account" =~ ^[0-9a-f]{32}$ ]] ||
  fail "An account ID is 32 letters and numbers, like the one wrangler whoami shows. Nothing was saved."

echo
base64 -i "$key" | gh secret set DUKOI_KEYSTORE_BASE64 --repo "$repo"
printf '%s' "$DUKOI_KEYSTORE_PASSWORD" | gh secret set DUKOI_KEYSTORE_PASSWORD --repo "$repo"
printf '%s' "$cf_token" | gh secret set CLOUDFLARE_API_TOKEN --repo "$repo"
printf '%s' "$cf_account" | gh secret set CLOUDFLARE_ACCOUNT_ID --repo "$repo"
unset DUKOI_KEYSTORE_PASSWORD cf_token

printf '\n✓ Saved 4 secrets. The Release workflow can run now.\n'
gh secret list --repo "$repo"

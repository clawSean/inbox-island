#!/bin/sh
set -eu

# Bootstrap/audit artifact only: this deliberately strips the source manifest's
# canonical Web Store public key. The source extension/ directory is the current
# stable-ID unpacked build; prepare a separate release package when submission is ready.

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
extension_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
seed_dir="$extension_dir/seed"
dist_dir="$extension_dir/dist"
version=$(jq -r '.version' "$seed_dir/manifest.json")
output="$dist_dir/inbox-island-webstore-seed-$version.zip"
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/inbox-island-webstore.XXXXXX")

cleanup() {
  trash "$work_dir" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$dist_dir" "$work_dir/icons"

jq '.' "$seed_dir/manifest.json" > "$work_dir/manifest.json"
cp "$seed_dir/popup.html" "$work_dir/popup.html"
cp "$seed_dir/popup.css" "$work_dir/popup.css"
for size in 16 32 48 128; do
  cp "$extension_dir/icons/icon${size}.png" "$work_dir/icons/icon${size}.png"
done

TZ=UTC touch -t 200001010000 \
  "$work_dir/manifest.json" "$work_dir/popup.html" "$work_dir/popup.css" \
  "$work_dir/icons/icon16.png" "$work_dir/icons/icon32.png" \
  "$work_dir/icons/icon48.png" "$work_dir/icons/icon128.png"

jq -e '
  .manifest_version == 3 and
  .name == "Inbox Island" and
  (has("key") | not) and
  (has("permissions") | not) and
  (has("optional_permissions") | not) and
  (has("host_permissions") | not) and
  (has("optional_host_permissions") | not) and
  (has("oauth2") | not) and
  (has("background") | not) and
  (has("content_scripts") | not) and
  (has("externally_connectable") | not)
' "$work_dir/manifest.json" >/dev/null

if [ -e "$output" ]; then
  trash "$output"
fi

(
  cd "$work_dir"
  zip -X -q "$output" \
    manifest.json popup.html popup.css \
    icons/icon16.png icons/icon32.png icons/icon48.png icons/icon128.png
)

printf '%s\n' \
  icons/icon128.png \
  icons/icon16.png \
  icons/icon32.png \
  icons/icon48.png \
  manifest.json \
  popup.css \
  popup.html > "$work_dir/expected.txt"
zipinfo -1 "$output" | LC_ALL=C sort > "$work_dir/actual.txt"
diff -u "$work_dir/expected.txt" "$work_dir/actual.txt"

if zipinfo -1 "$output" | grep -Eiq '(^|/).*[.](pem|key|p8|der)$'; then
  echo "Private-key-like file found in Web Store seed ZIP" >&2
  exit 1
fi

unzip -p "$output" manifest.json | jq -e '
  .name == "Inbox Island" and
  (has("key") | not) and
  (has("permissions") | not) and
  (has("host_permissions") | not) and
  (has("oauth2") | not)
' >/dev/null

sha256=$(shasum -a 256 "$output" | awk '{print $1}')
echo "Built $output"
echo "SHA-256 $sha256"

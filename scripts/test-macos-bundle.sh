#!/usr/bin/env bash
set -euo pipefail

dmg_path=""
require_signature=false
startup_timeout=5

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dmg)
      dmg_path="${2:-}"
      shift 2
      ;;
    --require-signature)
      require_signature=true
      shift
      ;;
    --startup-timeout)
      startup_timeout="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [ "$(uname -s)" != "Darwin" ]; then
  echo "macOS bundle smoke testing can only run on macOS." >&2
  exit 1
fi

if [ -z "$dmg_path" ]; then
  dmg_path=$(find "$(cd "$(dirname "$0")/.." && pwd)/src-tauri/target" \
    -type f -path '*/release/bundle/dmg/*.dmg' -print 2>/dev/null | head -n 1 || true)
fi
if [ -z "$dmg_path" ] || [ ! -f "$dmg_path" ]; then
  echo "A built DMG is required. Pass --dmg <path>." >&2
  exit 1
fi
dmg_path=$(cd "$(dirname "$dmg_path")" && pwd)/$(basename "$dmg_path")

temp_parent="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
run_root=$(mktemp -d "$temp_parent/jc-platform-macos-smoke.XXXXXX")
mount_point="$run_root/mount"
project_path="$run_root/upgrade-fixture.jcpro"
app_log="$run_root/application.log"
recovery_path="$HOME/Library/Application Support/com.jc.custom-platform/recovery/project-draft.json"
recovery_backup="$run_root/project-draft.backup.json"
recovery_existed=false
mounted=false
app_pid=""
bundle_identifier=""
bundle_version=""
test_completed=false

file_hash() {
  shasum -a 256 "$1" | awk '{print $1}'
}

cleanup() {
  status=$?
  trap - EXIT INT TERM
  set +e
  cleanup_failed=false
  if [ -n "$app_pid" ] && kill -0 "$app_pid" 2>/dev/null; then
    kill "$app_pid" 2>/dev/null
    wait "$app_pid" 2>/dev/null
  fi
  if [ "$mounted" = true ]; then
    if ! hdiutil detach -quiet "$mount_point" 2>/dev/null; then
      echo "Failed to detach $mount_point." >&2
      cleanup_failed=true
    fi
  fi
  if [ "$recovery_existed" = true ]; then
    mkdir -p "$(dirname "$recovery_path")"
    if ! cp -p "$recovery_backup" "$recovery_path"; then
      echo "Failed to restore the previous recovery draft." >&2
      cleanup_failed=true
    fi
  else
    if ! rm -f "$recovery_path"; then
      echo "Failed to remove the recovery test draft." >&2
      cleanup_failed=true
    fi
  fi
  if ! rm -rf "$run_root"; then
    echo "Failed to remove $run_root." >&2
    cleanup_failed=true
  fi
  if [ "$status" -eq 0 ] && [ "$cleanup_failed" = true ]; then
    status=1
  fi
  if [ "$status" -eq 0 ] && [ "$test_completed" = true ]; then
    echo "macOS bundle smoke test passed for $bundle_identifier $bundle_version."
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [ -f "$recovery_path" ]; then
  recovery_existed=true
  cp -p "$recovery_path" "$recovery_backup"
fi

mkdir -p "$mount_point" "$(dirname "$recovery_path")"
hdiutil attach -quiet -nobrowse -readonly -mountpoint "$mount_point" "$dmg_path"
mounted=true

app_bundle=$(find "$mount_point" -maxdepth 2 -type d -name '*.app' -print -quit)
if [ -z "$app_bundle" ]; then
  echo "No .app bundle was found in $dmg_path." >&2
  exit 1
fi

info_plist="$app_bundle/Contents/Info.plist"
bundle_identifier=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info_plist")
bundle_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info_plist")
bundle_executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$info_plist")
if [ "$bundle_identifier" != 'com.jc.custom-platform' ]; then
  echo "Unexpected bundle identifier: $bundle_identifier" >&2
  exit 1
fi
if [ -z "$bundle_version" ]; then
  echo "CFBundleShortVersionString is missing." >&2
  exit 1
fi

application="$app_bundle/Contents/MacOS/$bundle_executable"
if [ ! -x "$application" ]; then
  echo "Bundle executable is missing or not executable: $application" >&2
  exit 1
fi
if ! file "$application" | grep -q 'arm64'; then
  echo "Bundle executable does not contain the required arm64 architecture." >&2
  exit 1
fi

if [ "$require_signature" = true ]; then
  codesign --verify --deep --strict --verbose=2 "$app_bundle"
  spctl --assess --type execute --verbose=2 "$app_bundle"
  xcrun stapler validate "$app_bundle"
else
  codesign --display --verbose=2 "$app_bundle" 2>&1 || \
    echo "Nightly bundle is unsigned; signature enforcement is reserved for stable releases."
fi

cat >"$project_path" <<JSON
{
  "config_version": "jc001",
  "project": { "name": "macOS Bundle Fixture", "revision": 1 },
  "device": { "resolution_w": 800, "resolution_h": 480 }
}
JSON

cat >"$recovery_path" <<JSON
{
  "schemaVersion": 1,
  "projectPath": "$project_path",
  "projectName": "macOS Bundle Fixture",
  "savedAt": "2026-07-18T00:00:00.000Z",
  "document": {
    "config_version": "jc001",
    "project": { "name": "macOS Bundle Fixture", "revision": 2 },
    "device": { "resolution_w": 800, "resolution_h": 480 }
  }
}
JSON

project_hash=$(file_hash "$project_path")
recovery_hash=$(file_hash "$recovery_path")

"$application" "$project_path" >"$app_log" 2>&1 &
app_pid=$!
sleep "$startup_timeout"
if ! kill -0 "$app_pid" 2>/dev/null; then
  wait "$app_pid" || exit_code=$?
  cat "$app_log" >&2
  echo "Application exited during startup with code ${exit_code:-unknown}." >&2
  exit 1
fi

kill "$app_pid"
for _ in {1..20}; do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    break
  fi
  sleep 0.25
done
if kill -0 "$app_pid" 2>/dev/null; then
  kill -9 "$app_pid"
fi
wait "$app_pid" 2>/dev/null || true
app_pid=""

if [ "$(file_hash "$project_path")" != "$project_hash" ]; then
  echo "The external project file changed while launching the bundle." >&2
  exit 1
fi
if [ ! -f "$recovery_path" ] || [ "$(file_hash "$recovery_path")" != "$recovery_hash" ]; then
  echo "The recovery draft changed while launching the bundle." >&2
  exit 1
fi

test_completed=true

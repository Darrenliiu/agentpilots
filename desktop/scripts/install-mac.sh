#!/usr/bin/env bash
# Installs AgentPilots Desktop (Apple Silicon) and clears Gatekeeper quarantine.
# Unsigned builds downloaded via Chrome show as "damaged" until xattr is cleared.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Darrenliiu/agentpilots/main/desktop/scripts/install-mac.sh | bash
#
# Optional env:
#   AGENTPILOTS_GITHUB_REPO   owner/repo (default: Darrenliiu/agentpilots)
set -euo pipefail

REPO="${AGENTPILOTS_GITHUB_REPO:-Darrenliiu/agentpilots}"
APP_NAME="AgentPilots"
INSTALL_DIR="/Applications"
APP_PATH="${INSTALL_DIR}/${APP_NAME}.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer only runs on macOS." >&2
  exit 1
fi

if [[ "$(uname -m)" != "arm64" ]]; then
  echo "AgentPilots Desktop currently supports Apple Silicon (arm64) only." >&2
  echo "Intel Macs are not supported yet." >&2
  exit 1
fi

TMPDIR_INSTALL="$(mktemp -d)"
MOUNT_POINT=""

cleanup() {
  if [[ -n "${MOUNT_POINT}" && -d "${MOUNT_POINT}" ]]; then
    hdiutil detach "${MOUNT_POINT}" -quiet 2>/dev/null || true
  fi
  rm -rf "${TMPDIR_INSTALL}"
}
trap cleanup EXIT

echo "Fetching latest release from ${REPO}..."
RELEASE_JSON="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest")"

DMG_URL="$(
  python3 -c '
import json, sys
data = json.load(sys.stdin)
for asset in data.get("assets", []):
    name = asset.get("name") or ""
    if name.startswith("AgentPilots-") and name.endswith("-arm64.dmg"):
        print(asset["browser_download_url"])
        break
' <<<"${RELEASE_JSON}"
)"

if [[ -z "${DMG_URL}" ]]; then
  echo "Could not find AgentPilots-*-arm64.dmg in the latest GitHub release." >&2
  echo "Check https://github.com/${REPO}/releases/latest" >&2
  exit 1
fi

DMG_PATH="${TMPDIR_INSTALL}/AgentPilots-arm64.dmg"
echo "Downloading ${DMG_URL}..."
curl -fL --progress-bar -o "${DMG_PATH}" "${DMG_URL}"

echo "Mounting DMG..."
MOUNT_OUTPUT="$(hdiutil attach "${DMG_PATH}" -nobrowse -readonly)"
MOUNT_POINT="$(echo "${MOUNT_OUTPUT}" | awk 'END { print $NF }')"

APP_SRC="$(find "${MOUNT_POINT}" -maxdepth 2 -name "${APP_NAME}.app" -type d | head -n 1)"
if [[ -z "${APP_SRC}" ]]; then
  echo "Could not find ${APP_NAME}.app inside the DMG." >&2
  exit 1
fi

echo "Installing to ${APP_PATH}..."
rm -rf "${APP_PATH}"
cp -R "${APP_SRC}" "${APP_PATH}"

echo "Clearing Gatekeeper quarantine..."
xattr -cr "${APP_PATH}"

echo "Launching ${APP_NAME}..."
open "${APP_PATH}"

echo ""
echo "Done. Sign in with the same account as the web app to sync communities."
echo "If Gatekeeper blocks the app again after an auto-update, re-run this installer"
echo "or: xattr -cr ${APP_PATH}"

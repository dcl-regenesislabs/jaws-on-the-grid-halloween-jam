#!/bin/bash
# Windows (Git Bash) twin of restart-preview.sh: restart preview + MP server
# and push the deep link to the USB phone.
#
# Same approach as the macOS script: the bevy headless server kills itself
# on a double scene mount (stale scene lock after a reload), so the preview
# runs with --no-server and the bevy server is a supervised loop that clears
# the lock and respawns whenever it dies.
# Usage: scripts/restart-preview-win.sh [log-dir]
set -e
cd "$(dirname "$0")/.."

BEVY_PKG="@dcl-regenesislabs/bevy-headless-server@0.1.0-36033403774.commit-19347eb"
LOCK_DIR="$LOCALAPPDATA/decentraland/BevyExplorer/data/scene-locks"
LOG_DIR=${1:-"${TMP:-/tmp}"}
PREVIEW_LOG="$LOG_DIR/shark-preview.log"
SERVER_LOG="$LOG_DIR/shark-mp-server.log"
PIDFILE="$LOG_DIR/shark-mp-supervisor.pid"

# Stop the previous supervisor, server and preview.
[ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null || true
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -match 'sdk-commands|bevy-headless-server' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" || true
sleep 1
rm -f "$LOCK_DIR"/*.lock
: > "$SERVER_LOG"

# Preview, no in-process server.
npm run start -- --mobile --no-browser --no-server > "$PREVIEW_LOG" 2>&1 &

# Supervised MP server: respawn forever, clearing the stale lock each time.
(
  while true; do
    rm -f "$LOCK_DIR"/*.lock
    npx --yes "$BEVY_PKG" --realm=http://localhost:8000 >> "$SERVER_LOG" 2>&1 || true
    echo "--- bevy exited $(date +%H:%M:%S), restarting in 2s ---" >> "$SERVER_LOG"
    sleep 2
  done
) &
echo $! > "$PIDFILE"
echo "preview log: $PREVIEW_LOG  server log: $SERVER_LOG"

until grep -q "decentraland://" "$PREVIEW_LOG" 2>/dev/null; do sleep 1; done
until grep -q "first tick reached" "$SERVER_LOG" 2>/dev/null; do sleep 1; done
sleep 1

LINK=$(grep -oE "decentraland://[^ ]*" "$PREVIEW_LOG" | head -1)
echo "link: $LINK"
MSYS_NO_PATHCONV=1 adb shell "am start -W -a android.intent.action.VIEW -d '$LINK' org.decentraland.godotexplorer" | tail -1

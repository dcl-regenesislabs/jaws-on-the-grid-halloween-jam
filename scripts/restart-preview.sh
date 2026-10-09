#!/bin/bash
# Restart preview + MP server and push the deep link to the phone.
#
# The bevy headless server kills itself on a double scene mount (stale scene
# lock after a client websocket flap), and the CLI spawns it in-process. So we
# run them separately: preview with --no-server, and the bevy server as a
# supervised child that auto-restarts + clears the stale lock when it dies.
set -e
cd "$(dirname "$0")/.."

BEVY_PKG="@dcl-regenesislabs/bevy-headless-server@0.1.0-36033403774.commit-19347eb"
LOCK_DIR="/Users/lordmanuel/Library/Application Support/org.decentraland.BevyExplorer/scene-locks"
PREVIEW_LOG=/tmp/shark-preview.log
SERVER_LOG=/tmp/shark-mp-server.log

pkill -f "sdk-commands start" 2>/dev/null || true
pkill -f "bevy-headless-server" 2>/dev/null || true
sleep 1
rm -f "$LOCK_DIR"/*.lock

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
echo "server supervisor pid $!"

# Wait for both to be up.
until grep -q "decentraland://" "$PREVIEW_LOG" 2>/dev/null; do sleep 1; done
until grep -q "first tick reached" "$SERVER_LOG" 2>/dev/null; do sleep 1; done
sleep 1

LINK=$(grep -oE "decentraland://[^ ]*" "$PREVIEW_LOG" | head -1)
echo "link: $LINK"
adb shell "am start -W -a android.intent.action.VIEW -d \"$LINK\" org.decentraland.godotexplorer" | tail -1
echo "up. server log: $SERVER_LOG"

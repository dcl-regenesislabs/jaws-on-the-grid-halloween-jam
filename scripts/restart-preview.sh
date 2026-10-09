#!/bin/bash
# Restart preview + MP server cleanly and push the deep link to the phone.
# The CLI's watch-respawn leaves the old MP server holding the scene lock, so
# every code change needs this full restart.
set -e
cd "$(dirname "$0")/.."

pkill -f "sdk-commands start" 2>/dev/null || true
sleep 1
rm -f "/Users/lordmanuel/Library/Application Support/org.decentraland.BevyExplorer/scene-locks/"*.lock

LOG=/tmp/shark-preview.log
npm run start -- --mobile --no-browser > "$LOG" 2>&1 &
echo "preview starting (pid $!), log: $LOG"
until grep -q "decentraland://" "$LOG" 2>/dev/null; do sleep 1; done
# Wait for the MP server to fully boot before the phone joins: an early join
# makes the CLI spawn a duplicate server and one dies on the scene lock.
until grep -q "first tick reached" "$LOG" 2>/dev/null; do sleep 1; done
sleep 2
if grep -q "exited with code 1" "$LOG"; then
  echo "MP server died on startup, retrying..."
  exec "$0"
fi
LINK=$(grep -oE "decentraland://[^ ]*" "$LOG" | head -1)
echo "link: $LINK"
adb shell "am start -W -a android.intent.action.VIEW -d \"$LINK\" org.decentraland.godotexplorer" | tail -1

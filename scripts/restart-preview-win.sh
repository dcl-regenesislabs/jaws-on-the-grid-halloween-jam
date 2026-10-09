#!/bin/bash
# Windows (Git Bash) twin of restart-preview.sh: restart preview + MP server
# cleanly and push the deep link to the USB phone. The CLI's watch-respawn
# leaves a stale scene lock, so server code changes need this full restart.
# Usage: scripts/restart-preview-win.sh [logfile]
set -e
cd "$(dirname "$0")/.."

LOG=${1:-"${TMP:-/tmp}/shark-preview.log"}
LOCKS="$LOCALAPPDATA/decentraland/BevyExplorer/data/scene-locks"

powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -match 'sdk-commands' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" || true
sleep 1
rm -f "$LOCKS"/*.lock

npm run start -- --mobile --no-browser > "$LOG" 2>&1 &
echo "preview starting (pid $!), log: $LOG"
until grep -q "decentraland://" "$LOG" 2>/dev/null; do sleep 1; done
# Wait for the MP server to fully boot before the phone joins.
until grep -qE "first tick reached|already served|exited with code" "$LOG" 2>/dev/null; do sleep 1; done
if grep -qE "already served|exited with code" "$LOG"; then
  echo "MP server failed to start:"; grep -E "already served|exited with code" "$LOG"; exit 1
fi
sleep 2
LINK=$(grep -oE "decentraland://[^ ]*" "$LOG" | head -1)
echo "link: $LINK"
MSYS_NO_PATHCONV=1 adb shell "am start -W -a android.intent.action.VIEW -d '$LINK' org.decentraland.godotexplorer" | tail -1

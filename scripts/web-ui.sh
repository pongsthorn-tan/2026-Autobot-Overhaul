#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

usage() {
  cat <<EOF
Usage: $(basename "$0") <command>

Commands:
  start    Start the autobot system (API server + scheduler)
  stop     Stop the autobot system
  status   Check if the system is running

Examples:
  $(basename "$0") start
  $(basename "$0") stop
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

COMMAND="$1"
PID_FILE="$PROJECT_DIR/.web-ui.pid"

case "$COMMAND" in
  start)
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "Autobot system is already running (PID: $(cat "$PID_FILE"))"
      exit 0
    fi
    echo "[start] Starting Autobot system..."
    cd "$PROJECT_DIR"
    nohup npx tsx src/main.ts > logs/system.log 2>&1 &
    echo $! > "$PID_FILE"
    echo "Autobot system started (PID: $(cat "$PID_FILE"))"
    echo "API server: http://localhost:${WEB_UI_PORT:-3000}"
    echo "Logs: $PROJECT_DIR/logs/system.log"
    ;;
  stop)
    if [[ -f "$PID_FILE" ]]; then
      PID="$(cat "$PID_FILE")"
      if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        rm -f "$PID_FILE"
        echo "[stop] Autobot system stopped."
      else
        rm -f "$PID_FILE"
        echo "Autobot system was not running (stale PID file cleaned up)."
      fi
    else
      echo "Autobot system is not running."
    fi
    ;;
  status)
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "Autobot system is running (PID: $(cat "$PID_FILE"))"
    else
      echo "Autobot system is not running."
    fi
    ;;
  *)
    echo "Unknown command: $COMMAND"
    usage
    exit 1
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
API_BASE="http://localhost:${WEB_UI_PORT:-3000}/api"

usage() {
  cat <<EOF
Usage: $(basename "$0") <command> [options]

Commands:
  start   <service>    Start a service
  stop    <service>    Stop a service
  pause   <service>    Pause a service
  resume  <service>    Resume a paused service
  status  [service]    Show status of all services or a specific service
  logs    <service>    Show logs for a service
    -f                 Follow log output
  list                 List all registered services

Examples:
  $(basename "$0") start research
  $(basename "$0") status
  $(basename "$0") logs report -f
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

COMMAND="$1"
shift

case "$COMMAND" in
  start|stop|pause|resume)
    if [[ $# -lt 1 ]]; then
      echo "Error: service name required"
      usage
      exit 1
    fi
    SERVICE="$1"
    echo "[$COMMAND] Service: $SERVICE"
    curl -s -X POST "$API_BASE/services/$SERVICE/$COMMAND" | python3 -m json.tool 2>/dev/null || echo "(no response)"
    ;;
  status)
    if [[ $# -ge 1 ]]; then
      SERVICE="$1"
      echo "[status] Service: $SERVICE"
      curl -s "$API_BASE/services/$SERVICE" | python3 -m json.tool 2>/dev/null || echo "(no response)"
    else
      echo "[status] All services:"
      curl -s "$API_BASE/services" | python3 -m json.tool 2>/dev/null || echo "(no response)"
    fi
    ;;
  logs)
    if [[ $# -lt 1 ]]; then
      echo "Error: service name required"
      usage
      exit 1
    fi
    SERVICE="$1"
    FOLLOW=""
    if [[ "${2:-}" == "-f" ]]; then
      FOLLOW="-f"
    fi
    if [[ -n "$FOLLOW" ]]; then
      LOG_FILE="$PROJECT_DIR/logs/$SERVICE.jsonl"
      if [[ -f "$LOG_FILE" ]]; then
        tail -f "$LOG_FILE"
      else
        echo "No logs found for service: $SERVICE"
      fi
    else
      curl -s "$API_BASE/logs/$SERVICE" | python3 -m json.tool 2>/dev/null || echo "(no response)"
    fi
    ;;
  list)
    echo "[list] Registered services:"
    curl -s "$API_BASE/services" | python3 -m json.tool 2>/dev/null || echo "(no response)"
    ;;
  *)
    echo "Unknown command: $COMMAND"
    usage
    exit 1
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
API_BASE="http://localhost:${WEB_UI_PORT:-3000}/api"

usage() {
  cat <<EOF
Usage: $(basename "$0") <command> [options]

Commands:
  budget     <service>              Check remaining budget for a service
  add-budget <service> <amount>     Add budget to a service (USD)
  allocate   <service> <amount>     Allocate new budget to a service (USD)
  report     [service]              Cost report for all or a specific service
  tasks      <service>              Show per-task cost breakdown
  alert      [service]              Show budget alerts

Examples:
  $(basename "$0") budget research
  $(basename "$0") add-budget research 5.00
  $(basename "$0") report
  $(basename "$0") tasks research
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

COMMAND="$1"
shift

case "$COMMAND" in
  budget)
    if [[ $# -lt 1 ]]; then
      echo "Error: service name required"
      usage
      exit 1
    fi
    SERVICE="$1"
    echo "[budget] Service: $SERVICE"
    curl -s "$API_BASE/budgets/$SERVICE" | python3 -m json.tool 2>/dev/null || echo "(no response)"
    ;;
  add-budget)
    if [[ $# -lt 2 ]]; then
      echo "Error: service name and amount required"
      usage
      exit 1
    fi
    SERVICE="$1"
    AMOUNT="$2"
    echo "[add-budget] Service: $SERVICE, Amount: \$$AMOUNT"
    curl -s -X POST -H "Content-Type: application/json" -d "{\"amount\": $AMOUNT}" "$API_BASE/budgets/$SERVICE/add" | python3 -m json.tool 2>/dev/null || echo "(no response)"
    ;;
  allocate)
    if [[ $# -lt 2 ]]; then
      echo "Error: service name and amount required"
      usage
      exit 1
    fi
    SERVICE="$1"
    AMOUNT="$2"
    echo "[allocate] Service: $SERVICE, Amount: \$$AMOUNT"
    curl -s -X POST -H "Content-Type: application/json" -d "{\"amount\": $AMOUNT}" "$API_BASE/budgets/$SERVICE/allocate" | python3 -m json.tool 2>/dev/null || echo "(no response)"
    ;;
  report)
    if [[ $# -ge 1 ]]; then
      SERVICE="$1"
      echo "[report] Service: $SERVICE"
      curl -s "$API_BASE/costs/$SERVICE" | python3 -m json.tool 2>/dev/null || echo "(no response)"
    else
      echo "[report] All services:"
      curl -s "$API_BASE/costs" | python3 -m json.tool 2>/dev/null || echo "(no response)"
    fi
    ;;
  tasks)
    if [[ $# -lt 1 ]]; then
      echo "Error: service name required"
      usage
      exit 1
    fi
    SERVICE="$1"
    echo "[tasks] Service: $SERVICE"
    curl -s "$API_BASE/costs/$SERVICE/tasks" | python3 -m json.tool 2>/dev/null || echo "(no response)"
    ;;
  alert)
    echo "[alert] Budget alerts:"
    curl -s "$API_BASE/budgets" | python3 -m json.tool 2>/dev/null || echo "(no response)"
    ;;
  *)
    echo "Unknown command: $COMMAND"
    usage
    exit 1
    ;;
esac

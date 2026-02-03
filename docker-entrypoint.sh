#!/bin/sh
set -e

echo "Starting Autobot API server on port ${WEB_UI_PORT:-7600}..."
node dist/src/main.js &
API_PID=$!

echo "Starting Autobot Web UI on port ${WEBUI_PORT:-7601}..."
cd /app/web-ui-standalone
HOSTNAME=0.0.0.0 PORT=${WEBUI_PORT:-7601} node server.js &
WEBUI_PID=$!
cd /app

# Handle graceful shutdown
cleanup() {
  kill $API_PID $WEBUI_PID 2>/dev/null || true
  exit 0
}
trap cleanup TERM INT

echo "Autobot system running."
echo "  API:    http://0.0.0.0:${WEB_UI_PORT:-7600}"
echo "  Web UI: http://0.0.0.0:${WEBUI_PORT:-7601}"

# Wait for processes
wait $API_PID $WEBUI_PID 2>/dev/null || true
echo "A process exited, shutting down..."
kill $API_PID $WEBUI_PID 2>/dev/null || true
wait 2>/dev/null || true

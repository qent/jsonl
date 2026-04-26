#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-8000}"
URL="http://localhost:${PORT}/index.html"

cd "${ROOT_DIR}"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Error: python3 or python is required to start a local server." >&2
  exit 1
fi

echo "Serving ${ROOT_DIR} on http://localhost:${PORT}"
echo "Opening ${URL}"
echo "Press Ctrl+C to stop the server."

if command -v open >/dev/null 2>&1; then
  (sleep 1; open "${URL}") >/dev/null 2>&1 &
elif command -v xdg-open >/dev/null 2>&1; then
  (sleep 1; xdg-open "${URL}") >/dev/null 2>&1 &
fi

exec "${PYTHON_BIN}" -m http.server "${PORT}"

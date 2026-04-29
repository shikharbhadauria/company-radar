#!/bin/bash
set -e

SEARXNG_SRC="/tmp/searxng-local"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$SEARXNG_SRC" ]; then
  echo "First run — cloning SearXNG..."
  git clone --depth 1 https://github.com/searxng/searxng.git "$SEARXNG_SRC"
  pip3 install -r "$SEARXNG_SRC/requirements.txt"
  echo "Done."
fi

echo "Starting SearXNG at http://localhost:8080"
PYTHONPATH="$SEARXNG_SRC" \
SEARXNG_SETTINGS_PATH="$SCRIPT_DIR/settings.yml" \
python3 -m searx.webapp

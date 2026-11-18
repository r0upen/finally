#!/usr/bin/env bash
# Start the FinAlly container. Safe to run repeatedly.
#
# Usage: scripts/start_mac.sh [--build] [--no-open] [--mock]
#   --build    rebuild the image even if it exists
#   --no-open  do not open the browser
#   --mock     run with LLM_MOCK=true (same as: LLM_MOCK=true scripts/start_mac.sh)
# Env: PORT=8001 scripts/start_mac.sh   to use a different host port (default 8000)
set -euo pipefail

IMAGE=finally
CONTAINER=finally
VOLUME=finally-data
PORT="${PORT:-8000}"
URL="http://localhost:${PORT}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BUILD=false
OPEN=true
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=true ;;
    --no-open) OPEN=false ;;
    --mock) LLM_MOCK=true ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and try again." >&2
  exit 1
fi

if $BUILD || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building image '$IMAGE'..."
  docker build -t "$IMAGE" "$ROOT"
fi

# Remove any previous container with the same name
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

# Refuse to start if something else already holds the host port
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use." >&2
  OTHER="$(docker ps --filter "publish=$PORT" --format '{{.Names}}')"
  if [ -n "$OTHER" ]; then
    echo "It is held by Docker container '$OTHER'. Stop it, or run with PORT=<other port>." >&2
  else
    echo "Free the port, or run with PORT=<other port>." >&2
  fi
  exit 1
fi

RUN_ARGS=(-d --name "$CONTAINER" -v "${VOLUME}:/app/db" -p "${PORT}:8000")
if [ -f "$ROOT/.env" ]; then
  RUN_ARGS+=(--env-file "$ROOT/.env")
else
  echo "Note: no .env found. Using the market simulator; chat is disabled unless LLM_MOCK=true."
fi
# Values from the caller's environment override .env
if [ -n "${LLM_MOCK:-}" ]; then
  RUN_ARGS+=(-e "LLM_MOCK=${LLM_MOCK}")
fi

docker run "${RUN_ARGS[@]}" "$IMAGE" >/dev/null
echo "Container '$CONTAINER' started${LLM_MOCK:+ (LLM_MOCK=${LLM_MOCK})}. Waiting for health..."

for _ in $(seq 1 60); do
  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
    echo "Container exited during startup. Logs:" >&2
    docker logs --tail 50 "$CONTAINER" >&2
    exit 1
  fi
  if curl -fs "$URL/api/health" >/dev/null 2>&1; then
    echo "FinAlly is running at $URL"
    if $OPEN && command -v open >/dev/null 2>&1; then
      open "$URL"
    fi
    exit 0
  fi
  sleep 1
done

echo "Container did not become healthy within 60s. Recent logs:" >&2
docker logs --tail 50 "$CONTAINER" >&2
exit 1

#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
POD_NAME="skeleton-app-test"
MAX_WAIT=120

if [ "${SKIP_BUILD:-}" = "1" ]; then
  echo "Skipping image build (SKIP_BUILD=1)..."
else
  echo "Building container images..."
  podman build -t localhost/skeleton-app-server:test "$PROJECT_DIR/server" &
  podman build -t localhost/skeleton-app-client:test "$PROJECT_DIR/client" &
  podman build -t localhost/skeleton-app-mock-anthropic:test "$PROJECT_DIR/mock_anthropic_server" &
  wait
fi

echo "Cleaning up existing pod..."
podman kube down "$PROJECT_DIR/test/test-pod.yaml" 2>/dev/null || true

echo "Starting pod..."
podman kube play "$PROJECT_DIR/test/test-pod.yaml"

dump_logs() {
  for c in $(podman pod inspect "$POD_NAME" --format '{{range .Containers}}{{.Name}} {{end}}'); do
    echo "$c" | grep -q "infra" && continue
    echo "=== $c ==="
    podman logs "$c" 2>&1 | tail -20
  done
}

# Poll the services directly instead of Podman's .State.Health.Status,
# which never reaches "healthy" under Podman 5 on GitHub runners.
# Must cover every container in test/test-pod.yaml (ports included).
CHECKS=(
  "traefik|curl -fsS --max-time 5 http://localhost:8151/ping"
  "db|podman exec ${POD_NAME}-db pg_isready -U postgres"
  "mock-anthropic|curl -fsS --max-time 5 http://localhost:3050/health"
  "mock-oauth2|curl -fsS --max-time 5 http://localhost:8050/health"
  "server|curl -fsS --max-time 5 http://localhost:8150/api/environment"
  "client|curl -fsS --max-time 5 http://localhost:8150/"
)

echo "Waiting for all services to respond..."
for check in "${CHECKS[@]}"; do
  name="${check%%|*}"
  probe="${check#*|}"
  echo "  Waiting for $name..."
  ELAPSED=0
  until $probe > /dev/null 2>&1; do
    if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
      echo "Timeout waiting for $name"
      dump_logs
      exit 1
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
  done
  echo "  $name is ready"
done

echo "All services are ready!"

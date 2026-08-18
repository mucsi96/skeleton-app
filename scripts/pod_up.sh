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
  for c in $CONTAINERS; do
    echo "$c" | grep -q "infra" && continue
    echo "=== $c ==="
    podman logs "$c" 2>&1 | tail -20
  done
}

echo "Waiting for all containers to become healthy..."
CONTAINERS=$(podman pod inspect "$POD_NAME" --format '{{range .Containers}}{{.Name}} {{end}}')

# --- Temporary diagnostics for Podman 5 health reporting ---
dump_health_fields() {
  for c in $CONTAINERS; do
    echo "$c" | grep -q "infra" && continue
    echo "--- $c ---"
    podman inspect "$c" | jq -c '{Config: (.[0].Config | with_entries(select(.key | test("ealth")))), State: (.[0].State | with_entries(select(.key | test("ealth"))))}' || true
  done
}

echo "DIAG: podman version: $(podman --version)"
echo "DIAG: health-related inspect fields right after pod start:"
dump_health_fields

echo "DIAG: passively observing health state for 30s (no manual healthcheck runs):"
for i in $(seq 1 6); do
  sleep 5
  for c in $CONTAINERS; do
    echo "$c" | grep -q "infra" && continue
    echo "DIAG t=$((i*5))s $c: $(podman inspect "$c" | jq -c '.[0].State | with_entries(select(.key | test("ealth")))')" || true
  done
done
# --- End diagnostics ---

for container in $CONTAINERS; do
  if echo "$container" | grep -q "infra"; then
    continue
  fi
  echo "  Waiting for $container..."
  ELAPSED=0
  # Run each container's healthcheck on demand instead of reading
  # .State.Health.Status: Podman 5 on GitHub runners never schedules or
  # records probe runs, so the status alone never becomes "healthy".
  until podman healthcheck run "$container" > /dev/null 2>&1; do
    if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
      echo "Timeout waiting for $container to become healthy"
      dump_logs
      exit 1
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
  done
  echo "  $container is healthy"
done

echo "DIAG: health-related inspect fields after manual healthcheck runs:"
dump_health_fields

echo "All services are ready!"

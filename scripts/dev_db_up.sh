#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
POD_NAME="skeleton-app-dev-db"
DB_CONTAINER="skeleton-app-dev-db-db"
DB_IMAGE="docker.io/library/postgres:17.5-bullseye"
MAX_WAIT=60

if podman inspect --format='{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null | grep -q "true"; then
  echo "Database is already running"
  exit 0
fi

echo "Cleaning up existing pod..."
podman pod rm -f "$POD_NAME" 2>/dev/null || true

mkdir -p "$PROJECT_DIR/postgres-data"

echo "Creating pod..."
podman pod create --name "$POD_NAME" -p 5433:5432

echo "Starting database container..."
podman run -d --pod "$POD_NAME" --name "$DB_CONTAINER" \
  -e POSTGRES_DB=skeleton \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -v "$PROJECT_DIR/postgres-data:/var/lib/postgresql/data" \
  --health-cmd "pg_isready -U postgres" \
  --health-interval 10s \
  --health-timeout 5s \
  --health-retries 5 \
  "$DB_IMAGE"

echo "Waiting for database to become healthy..."
ELAPSED=0
while true; do
  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    echo "Timeout waiting for database to become healthy"
    exit 1
  fi
  STATUS=$(podman inspect --format='{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null || echo "missing")
  if [ "$STATUS" = "healthy" ]; then
    echo "Development database is ready on port 5433"
    break
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

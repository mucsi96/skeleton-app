#!/bin/bash
set -e

echo "Removing existing dev database if present..."
podman rm -f skeleton-app-db 2>/dev/null || true

echo "Starting development database..."
podman run -d --name skeleton-app-db \
  -e POSTGRES_DB=skeleton \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5433:5432 \
  --health-cmd "pg_isready -U postgres" \
  --health-interval 10s \
  --health-timeout 5s \
  --health-retries 5 \
  docker.io/library/postgres:17.5-bullseye

echo "Waiting for database to become healthy..."
MAX_WAIT=60
ELAPSED=0

while true; do
  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    echo "Timeout waiting for database to become healthy"
    exit 1
  fi
  STATUS=$(podman inspect --format='{{.State.Health.Status}}' skeleton-app-db 2>/dev/null || echo "missing")
  if [ "$STATUS" = "healthy" ]; then
    echo "Development database is ready on port 5433"
    break
  fi
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

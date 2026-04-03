#!/bin/bash
set -e

echo "Stopping development database pod..."
podman pod rm -f skeleton-app-dev-db 2>/dev/null || true

echo "Development database stopped."

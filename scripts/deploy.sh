#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

: "${AZURE_KEYVAULT_NAME:?Environment variable AZURE_KEYVAULT_NAME is required}"
: "${SERVER_IMAGE:?Set the immutable server image to deploy}"
: "${CLIENT_IMAGE:?Set the immutable client image to deploy}"
if [[ ! "$SERVER_IMAGE" =~ ^ghcr\.io/.+(:sha-[a-f0-9]{40}|@sha256:[a-f0-9]{64})$ ]] ||
   [[ ! "$CLIENT_IMAGE" =~ ^ghcr\.io/.+(:sha-[a-f0-9]{40}|@sha256:[a-f0-9]{64})$ ]]; then
    printf '%s\n' 'SERVER_IMAGE and CLIENT_IMAGE must use GHCR with a full commit SHA tag or sha256 digest.' >&2
    exit 1
fi

AZURE_KEYVAULT_ENDPOINT="https://${AZURE_KEYVAULT_NAME}.vault.azure.net/"
SERVER_RELEASE_NAME=hello-server
CLIENT_RELEASE_NAME=hello-client

# Create a temporary file in /dev/shm (RAM) to avoid writing to disk
KUBECONFIG=$(mktemp /dev/shm/kubeconfig.XXXXXX)
export KUBECONFIG

# Ensure the temporary file is deleted when the script exits
trap 'rm -f "$KUBECONFIG"' EXIT

"$(dirname "$0")/pull_kubeconfig.sh"

HOSTNAME=$(az keyvault secret show --vault-name "$AZURE_KEYVAULT_NAME" --name hostname --query value -o tsv)
API_CLIENT_ID=$(az keyvault secret show --vault-name "$AZURE_KEYVAULT_NAME" --name api-client-id --query value -o tsv)

echo "Updating Helm repositories..."
# The mucsi96 charts no longer bundle Prometheus exporter sidecars or
# ServiceMonitors (client-app >= 22.0.0, spring-app >= 30.0.0, node-app >= 20.0.0).
# This deploy rolls out the updated charts and drops those containers.
helm repo add mucsi96 https://mucsi96.github.io/k8s-helm-charts --force-update

springAppChartVersion=$(helm search repo mucsi96/spring-app --output json | jq -r '.[0].version')
clientAppChartVersion=$(helm search repo mucsi96/client-app --output json | jq -r '.[0].version')

echo "Deploying server: $SERVER_IMAGE using spring-app chart $springAppChartVersion"

# CPU limits are intentionally omitted for both services (limits.cpu=null
# clears the chart default): on a single-user node they only throttle
# startup; memory limits are the ones that matter.
#
# The server is a GraalVM native executable, so there is no JVM metaspace, no
# code cache and no JIT-compiled code to hold: it idles far below what a JRE
# image would use, hence the smaller request. The request is what the
# scheduler reserves around the clock, so it is sized for idle: metrics-server
# reports a ~58Mi working set in production, so the request sits just above
# that measurement.
#
# The limit is the opposite question and stays where it is: it has to cover the
# idle footprint plus the 256Mi heap the image is capped at (see the ENTRYPOINT
# in server/Dockerfile - keep the two in step).
helm upgrade $SERVER_RELEASE_NAME mucsi96/spring-app \
    --install \
    --version $springAppChartVersion \
    --set-string image="$SERVER_IMAGE" \
    --set entryPoint=web \
    --set host=$HOSTNAME \
    --set basePath=/api \
    --set clientId=$API_CLIENT_ID \
    --set serviceAccountName=hello-api-workload-identity \
    --set env.AZURE_KEYVAULT_ENDPOINT=$AZURE_KEYVAULT_ENDPOINT \
    --set env.CLIENT_APP_NAME=$CLIENT_RELEASE_NAME \
    --set resources.requests.memory=64Mi \
    --set resources.requests.cpu=25m \
    --set resources.limits.memory=256Mi \
    --set resources.limits.cpu=null \
    --wait

echo "Deploying client: $CLIENT_IMAGE using client-app chart $clientAppChartVersion"

helm upgrade $CLIENT_RELEASE_NAME mucsi96/client-app \
    --install \
    --version $clientAppChartVersion \
    --set-string image="$CLIENT_IMAGE" \
    --set host=$HOSTNAME \
    --set entryPoint=web \
    --set resources.requests.memory=16Mi \
    --set resources.requests.cpu=5m \
    --set resources.limits.memory=32Mi \
    --set resources.limits.cpu=null \
    --wait

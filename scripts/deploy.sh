#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

: "${AZURE_KEYVAULT_NAME:?Environment variable AZURE_KEYVAULT_NAME is required}"
: "${SERVER_IMAGE:?Set the versioned server image to deploy}"
: "${CLIENT_IMAGE:?Set the versioned client image to deploy}"
if [[ ! "$SERVER_IMAGE" =~ ^ghcr\.io/.+(:[1-9][0-9]*|@sha256:[a-f0-9]{64})$ ]] ||
   [[ ! "$CLIENT_IMAGE" =~ ^ghcr\.io/.+(:[1-9][0-9]*|@sha256:[a-f0-9]{64})$ ]]; then
    printf '%s\n' 'SERVER_IMAGE and CLIENT_IMAGE must use GHCR with a release version or sha256 digest.' >&2
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
AUTH_CONFIG=$(az keyvault secret show --vault-name "$AZURE_KEYVAULT_NAME" --name forward-auth-config --query value -o tsv)
AUTH_RELEASE=$(jq -er '.release_name | select(type == "string" and length > 0)' <<<"$AUTH_CONFIG")
PROXY_AUTH=$(jq -ce '.auth | select(.proxyService | type == "string" and length > 0) | select(.proxyPort | type == "number") | select(.mode == "api-token")' <<<"$AUTH_CONFIG")
CLIENT_RUNTIME_CONFIG=$(az keyvault secret show --vault-name "$AZURE_KEYVAULT_NAME" --name client-runtime-config --query value -o tsv | jq -ce 'select(.clientLogUrl | type == "string") | select(.clientAppName | type == "string")')

echo "Updating Helm repositories..."
# The mucsi96 charts no longer bundle Prometheus exporter sidecars or
# ServiceMonitors (client-app >= 22.0.0, spring-app >= 30.0.0, node-app >= 20.0.0).
# This deploy rolls out the updated charts and drops those containers.
helm repo add mucsi96 https://mucsi96.github.io/k8s-helm-charts --force-update

springAppChartVersion=$(helm search repo mucsi96/spring-app --output json | jq -r '.[0].version')
clientAppChartVersion=$(helm search repo mucsi96/client-app --output json | jq -r '.[0].version')

helm status "$AUTH_RELEASE" --namespace hello >/dev/null
helm show values mucsi96/spring-app --version "$springAppChartVersion" | grep -q '^auth:'
helm show values mucsi96/client-app --version "$clientAppChartVersion" | grep -q '^auth:'
helm show values mucsi96/client-app --version "$clientAppChartVersion" | grep -q '^runtimeConfig:'

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
    --reset-values \
    --version $springAppChartVersion \
    --set-string image="$SERVER_IMAGE" \
    --set host=$HOSTNAME \
    --set basePath=/api \
    --set-json auth="$PROXY_AUTH" \
    --set clientId=$API_CLIENT_ID \
    --set serviceAccountName=hello-api-workload-identity \
    --set env.AZURE_KEYVAULT_ENDPOINT=$AZURE_KEYVAULT_ENDPOINT \
    --set resources.requests.memory=64Mi \
    --set resources.requests.cpu=25m \
    --set resources.limits.memory=256Mi \
    --set resources.limits.cpu=null \
    --wait

echo "Deploying client: $CLIENT_IMAGE using client-app chart $clientAppChartVersion"

helm upgrade $CLIENT_RELEASE_NAME mucsi96/client-app \
    --install \
    --reset-values \
    --version $clientAppChartVersion \
    --set-string image="$CLIENT_IMAGE" \
    --set host=$HOSTNAME \
    --set-json auth="$PROXY_AUTH" \
    --set-json runtimeConfig="$CLIENT_RUNTIME_CONFIG" \
    --set healthPath=/index.html \
    --set resources.requests.memory=16Mi \
    --set resources.requests.cpu=5m \
    --set resources.limits.memory=32Mi \
    --set resources.limits.cpu=null \
    --wait

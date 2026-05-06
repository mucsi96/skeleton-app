#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

: "${AZURE_KEYVAULT_NAME:?Environment variable AZURE_KEYVAULT_NAME is required}"
: "${DOCKERHUB_USERNAME:?Environment variable DOCKERHUB_USERNAME is required}"
: "${AZURE_KEYVAULT_ENDPOINT:?Environment variable AZURE_KEYVAULT_ENDPOINT is required}"

K8S_CONFIG=$(az keyvault secret show --vault-name "$AZURE_KEYVAULT_NAME" --name k8s-config --query value -o tsv)
HOSTNAME=$(az keyvault secret show --vault-name "$AZURE_KEYVAULT_NAME" --name hostname --query value -o tsv)
API_CLIENT_ID=$(az keyvault secret show --vault-name "$AZURE_KEYVAULT_NAME" --name api-client-id --query value -o tsv)

# Create a temporary file in /dev/shm (RAM) to avoid writing to disk
KUBECONFIG_FILE=$(mktemp /dev/shm/kubeconfig.XXXXXX)
chmod 600 "$KUBECONFIG_FILE"
echo "$K8S_CONFIG" > "$KUBECONFIG_FILE"
export KUBECONFIG="$KUBECONFIG_FILE"

# Ensure the temporary file is deleted when the script exits
trap 'rm -f "$KUBECONFIG_FILE"' EXIT

# Get latest tags for both server and client
serverLatestTag=$(curl -s "https://registry.hub.docker.com/v2/repositories/$DOCKERHUB_USERNAME/skeleton-app-server/tags" | jq -r '.results | map(select(.name != "latest")) | sort_by(.last_updated) | reverse | .[0].name')
clientLatestTag=$(curl -s "https://registry.hub.docker.com/v2/repositories/$DOCKERHUB_USERNAME/skeleton-app-client/tags" | jq -r '.results | map(select(.name != "latest")) | sort_by(.last_updated) | reverse | .[0].name')

echo "Updating Helm repositories..."
helm repo add mucsi96 https://mucsi96.github.io/k8s-helm-charts --force-update

springAppChartVersion=$(helm search repo mucsi96/spring-app --output json | jq -r '.[0].version')
clientAppChartVersion=$(helm search repo mucsi96/client-app --output json | jq -r '.[0].version')

echo "Deploying server: $DOCKERHUB_USERNAME/skeleton-app-server:$serverLatestTag to $HOSTNAME using spring-app chart $springAppChartVersion"

helm upgrade hello-server mucsi96/spring-app \
    --install \
    --version $springAppChartVersion \
    --namespace hello \
    --set image=$DOCKERHUB_USERNAME/skeleton-app-server:$serverLatestTag \
    --set entryPoint=web \
    --set host=$HOSTNAME \
    --set basePath=/api \
    --set clientId=$API_CLIENT_ID \
    --set serviceAccountName=hello-api-workload-identity \
    --set env.AZURE_KEYVAULT_ENDPOINT=$AZURE_KEYVAULT_ENDPOINT \
    --set resources.requests.memory=1Gi \
    --set resources.requests.cpu=1 \
    --set resources.limits.memory=2Gi \
    --set resources.limits.cpu=2 \
    --wait

echo "Deploying client: $DOCKERHUB_USERNAME/skeleton-app-client:$clientLatestTag to $HOSTNAME using client-app chart $clientAppChartVersion"

helm upgrade hello-client mucsi96/client-app \
    --install \
    --version $clientAppChartVersion \
    --namespace hello \
    --set image=$DOCKERHUB_USERNAME/skeleton-app-client:$clientLatestTag \
    --set host=$HOSTNAME \
    --set entryPoint=web \
    --wait

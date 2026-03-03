#!/bin/bash
set -e

REMOTE="foundry"
REMOTE_PATH="/home/ubuntu/foundryuserdata/Data/systems/cyberpunk"
LOCAL_PATH="$(cd "$(dirname "$0")" && pwd)"

echo "Deploying cyberpunk system to ${REMOTE}:${REMOTE_PATH}..."

# Clean remote and recreate
ssh "$REMOTE" "rm -rf ${REMOTE_PATH} && mkdir -p ${REMOTE_PATH}"

# Copy everything, then remove excluded dirs/files on remote
scp -r "${LOCAL_PATH}/css" "${LOCAL_PATH}/fonts" "${LOCAL_PATH}/img" "${LOCAL_PATH}/lang" \
       "${LOCAL_PATH}/module" "${LOCAL_PATH}/system.json" "${LOCAL_PATH}/template.json" \
       "${LOCAL_PATH}/templates" "${REMOTE}:${REMOTE_PATH}/"

echo "Restarting Foundry..."
ssh "$REMOTE" "pm2 restart foundry"

echo "Done!"

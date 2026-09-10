#!/usr/bin/env bash
# Fresh Base Sepolia fork → deploy the Aqua stack → run a script under scripts/.
#   ./scripts/run-testnet.sh seed.fork
#   ./scripts/run-testnet.sh depeg.fork -- --run-keeper
set -euo pipefail
SCRIPT="${1:?usage: run-testnet.sh <script-basename> [-- args]}"
UP_RPC="${FORK_RPC:-https://base-sepolia-rpc.publicnode.com}"

pkill -f 'anvil --fork' 2>/dev/null || true
sleep 1
echo "forking Base Sepolia via $UP_RPC"
anvil --fork-url "$UP_RPC" --chain-id 84532 --silent &
ANVIL=$!
trap 'kill $ANVIL 2>/dev/null || true' EXIT
until cast bn --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; do sleep 1; done

echo "deploying Aqua + AquaSwapVMRouter…"
RPC=http://127.0.0.1:8545 NODE_NO_WARNINGS=1 npx tsx scripts/deploy-testnet.ts

RPC=http://127.0.0.1:8545 NODE_NO_WARNINGS=1 npx tsx "scripts/$SCRIPT.ts" "${@:2}"

#!/usr/bin/env bash
# Fresh Base fork + run a script under scripts/.  Usage: ./scripts/run-fork.sh phase1.fork
set -euo pipefail
SCRIPT="${1:?usage: run-fork.sh <script-basename>}"
UP_RPC="${FORK_RPC:-https://mainnet.base.org}"

pkill -f 'anvil --fork' 2>/dev/null || true
sleep 1
FB=$(( $(cast bn --rpc-url "$UP_RPC") - 40 ))
echo "forking Base @ $FB"
anvil --fork-url "$UP_RPC" --fork-block-number "$FB" --no-rate-limit --silent &
ANVIL=$!
trap 'kill $ANVIL 2>/dev/null || true' EXIT
until cast bn --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; do sleep 1; done

NODE_NO_WARNINGS=1 npx tsx "scripts/$SCRIPT.ts"

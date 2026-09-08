#!/usr/bin/env bash
# Fresh Base fork + run a Phase 0 spike.  Usage: ./run.sh phase0 | ./run.sh phase0b
set -euo pipefail
SCRIPT="${1:-phase0}"
RPC_UP="${FORK_RPC:-https://mainnet.base.org}"

pkill -f 'anvil --fork' 2>/dev/null || true
sleep 1
FB=$(( $(cast bn --rpc-url "$RPC_UP") - 40 ))
echo "forking Base @ $FB from $RPC_UP"
anvil --fork-url "$RPC_UP" --fork-block-number "$FB" --no-rate-limit --silent &
ANVIL=$!
trap 'kill $ANVIL 2>/dev/null || true' EXIT
until cast bn --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1; do sleep 1; done

NODE_NO_WARNINGS=1 npx tsx "$SCRIPT.ts"

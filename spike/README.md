# Phase 0 de-risk spike

Throwaway scripts that verify AquaLadder's core mechanic against a **Base mainnet fork**
before building the real app. See `../workdone.md` for results and `../plan.md` for context.

## Run

```bash
anvil --fork-url https://base.drpc.org \
  --fork-block-number $(( $(cast bn --rpc-url https://base.drpc.org) - 30 )) --silent &
cd spike && npm install && node phase0.cjs
```

## phase0.cjs — items 1 & 2

1. Aqua (`0x1111113CCf…`) + AquaSwapVMRouter (`0x111111338c…`) are callable on the fork; SDK maps are mainnet-only.
2. A pegged USDC/USDT strategy round-trips on the live deployment: `ship → quote → swap → dock`.

> The 1inch SDKs' ESM build is broken — these scripts use CommonJS (`require`).

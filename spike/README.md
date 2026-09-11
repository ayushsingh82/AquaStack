# Phase 0 de-risk spike (TypeScript)

Scripts that verify AquaStack's core mechanic against a **Base mainnet fork** before
building the real app. Results: `../workdone.md`. Context: `../plan.md`.

## Run

```bash
npm install
npm run phase0     # items 1 & 2  — Aqua/router live + pegged strategy round-trip
npm run phase0b    # items 3, 4, 5 — aToken rebase, aToken pull, dock() guards
```

`run.sh` starts a fresh forked anvil (kills any previous one), waits for it, runs the
script, and tears anvil down on exit. Override the upstream RPC with `FORK_RPC=…`.

## Files

| File | Purpose |
|---|---|
| `common.ts` | shared clients, addresses, `deal()` (storage-slot funding), `warp()` |
| `phase0.ts` | **item 1** contracts callable on the fork · **item 2** pegged USDC/USDbC `ship → quote → swap → dock` |
| `phase0b.ts` | **item 3** ship aUSDC/aUSDbC, warp 90d, prove yield accrues in the wallet & Aqua's virtual balance is untouched · **item 4** a real swap pulls a rebasing aToken from the maker · **item 5** every stale `dock()` / swap-after-dock path reverts |

## Gotchas learned

- 1inch SDKs' **ESM build is broken** — `tsconfig` compiles these as CommonJS (`module: CommonJS`) so `import` → `require` → the working CJS build.
- anvil fork needs an **archive** RPC: `mainnet.base.org` / `base.drpc.org` / `base.meowrpc.com` work; `publicnode` / `llamarpc` 403 on archive state.
- **USDT is not listed on Aave v3 Base** — the aToken pair is **aUSDC / aUSDbC** (both active, unfrozen).
- A strategy hash is immutable (`StrategiesMustBeImmutable`); the scripts add a per-run `salt` so they can be re-run without restarting the node.

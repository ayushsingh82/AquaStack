# AquaLadder — build plan (integration + keeper)

> Deposit once. One stablecoin balance earns Aave lending yield **and** 1inch Aqua
> LP fees at the same time, with an automated rule that unwinds on a depeg.

UI is not part of this plan. The integration library is the product; a UI slots
on top of `PositionState` (Phase 1) and the rule model (Phase 2) later.

## Target setup

| Choice | Pick | Why |
|---|---|---|
| Chain | **Base** | Aqua live, Aave v3 live, cheap, good demo story |
| Pool | **aUSDC / aUSDT pegged concentrate** (`AquaPeggedAmmStrategy`, tight linear width ~1.0) | both legs earn Aave supply APY, near-zero IL, fees from stable↔stable flow |
| Demo env | **Anvil or Tenderly fork of Base mainnet** | real Aqua + Aave contracts, fake money, scriptable depeg |
| Contracts | Aqua `0x1111113ccf1426a8e30e2bff5e005d929bf6a90a`, AquaSwapVMRouter `0x111111338c5091e8440b67b168bae16a668ac0de`, Aave v3 Pool (Base) | already deployed — you don't deploy anything |
| Stack | TS, viem, `@1inch/aqua-sdk`, `@1inch/swap-vm-sdk`, Privy (embedded wallet + session signer) | SDKs are the whole on-chain layer, ~no Solidity |

---

## Phase 0 — De-risk spike (do first, ~half a day, blocks everything)

One throwaway script against a Base fork. If it round-trips, the project is real. Answer these five, in order.
Spike code: `spike/phase0.ts` (items 1–2), `spike/phase0b.ts` (items 3–5). Full results: `workdone.md`.
**Status: all 5 items PASS. Phase 0 complete — GO for Phase 1.**

1. ✅ **Aqua + AquaSwapVMRouter callable on the Base fork** — bytecode present (`0x1111113CCf…`, `0x111111338c…`), read methods work. SDK address maps are **mainnet-only** → a fork is the only path.
2. ✅ **Pegged strategy runs on today's pre-Fusaka deployment** — `ship → quote → swap → dock` round-tripped on the live router (USDC/USDbC ±0.5%); SDK hash matched `router.hash(order)`; quote 0.99997; EOA-taker swap settled. `peggedSwapGrowPriceRange2D` (opcode idx 32) proven to execute.
3. ✅ **Rebase test (the critical one)** — shipped 50k aUSDC, warped +90 d: maker's **wallet** aUSDC grew +941 (≈3.8% APY); Aqua's **virtual** balance stayed exactly 50 000; quote/swap/dock still work; on dock the maker keeps principal + all yield, fully liquid. **"One balance, two jobs" is real.**
4. ✅ **aToken → Aqua approval + pull** — `aUSDC.approve(Aqua)` + `ship` + a real swap that `pull`s aUSDbC from the maker mid-swap all work. aToken swap costs ≈325k gas (≈2× plain ERC-20).
5. ✅ **`dock()` behavior** — instant pure-accounting; `_DOCKED` marker; `safeBalances`, a second `dock()`, a never-shipped `dock()`, and a swap-after-dock **all revert**. Keeper can retry safely.

**Exit criteria — met:** `ship → (90 d, yield accrues) → quote → swap → dock` round-trips and the yield is provably retained in the maker wallet.

**Toolchain notes:**
- 1inch SDKs' **ESM build is broken** — spike `tsconfig` compiles as CommonJS so `import`→`require`→working CJS build.
- anvil fork needs an **archive** RPC: `mainnet.base.org` / `base.drpc.org` / `base.meowrpc.com` work; `publicnode` / `llamarpc` 403 on archive.
- **USDT is not on Aave v3 Base** — pair is **aUSDC / aUSDbC**.
- `strategy` bytes for `ship` = `order.encode()` = `abi.encode((maker,traits,data))`; `strategyHash = keccak256(that)`. Add a `salt` for re-ship uniqueness (`StrategiesMustBeImmutable`).

---

## Phase 1 — On-chain integration library (`src/lib/aqua/`)

Pure functions, viem-based, fully covered by fork tests. No UI imports.

- **`deposit.ts`** — `buildDeposit(user, usdcAmount)` →
  1. USDC → split 50/50 → swap half to USDT (1inch API or a direct pool)
  2. `Aave.supply(USDC)` + `Aave.supply(USDT)` → aUSDC / aUSDT
  3. `approve(aUSDC, AQUA)` + `approve(aUSDT, AQUA)`
  4. `aqua.ship({ app: AquaSwapVMRouter, strategy: order.encode(), amountsAndTokens: [...] })`
  Returns `{ strategyHash, encodedOrder, txs[] }`. Sequence/batch the txs; return them for the caller to sign.

- **`strategy.ts`** — thin wrapper that turns a risk parameter (peg band width) into `AquaPeggedAmmStrategy` params. One knob for now.

- **`position.ts`** — read model:
  - `aqua` virtual balances for both legs
  - `aToken.balanceOf` − virtual balance = **accrued Aave yield**
  - `swapVM.quote()` for current mid-price / peg deviation
  - parse `Shipped` / `Pulled` / `Pushed` events → fee history
  Returns a single `PositionState` object (balances, 3 yield components, health vs. rule).

- **`unwind.ts`** — `buildUnwind(user, strategyHash)` →
  1. `aqua.dock({ app, strategyHash, tokens: [aUSDC, aUSDT] })`
  2. optional `Aave.withdraw` both legs → USDC back to user
  Idempotent: check strategy active before building.

**Tests:** every function exercised on the Base fork, including the rebase-accrual path.

---

## Phase 2 — Rule engine + store

- **Rule model** (per position): `pegDeviationBps` (e.g. exit if USDT < 0.995), `takeProfitBps`, `stopLossBps` / `maxDrawdownBps`, `autoUnwind: bool`.
- **Store:** Postgres or even SQLite/JSON for the hackathon. Rows: `{ user, strategyHash, chainId, rule, sessionSignerRef, status }`.
- **Evaluator** (pure function): `evaluate(PositionState, Rule) → { triggered, reason }`. Unit-tested with no chain.

---

## Phase 3 — Keeper (serverless cron)

- Runs every N min (Vercel cron / small worker).
- For each `status = active` position:
  1. Fetch price — Chainlink USDT/USD feed on Base **and** the pool's own `quote()` (compare; pool is what actually hurts you).
  2. `evaluate(position, rule)`.
  3. If triggered and `autoUnwind`: send `unwind.ts` txs via the **Privy session signer** (user offline). Then mark `status = unwound`, store tx hashes, notify.
- **Guards:** idempotency key per (strategyHash, trigger); catch "already docked" revert; alert-only fallback if the session signer is missing.
- **Honest limitation to document:** for a depeg, the keeper exits *after* detection — by then arbitrage has rotated the pool toward the bad asset, so `dock()` returns you holding more USDT. The rule caps the bleed, it doesn't prevent the loss. Frame the tagline as "auto-exits on depeg," not "before a loss."

---

## Phase 4 — Demo scripting (on the fork)

- **Seed flow:** a counter-party wallet that runs periodic aUSDC↔aUSDT swaps so fee accrual is visibly non-zero.
- **Depeg script:** `setStorageAt` on the Chainlink aggregator (or dump USDT into the pool) to push USDT to 0.99 → keeper fires `dock()` live.
- **Yield script:** advance fork time so the Aave leg visibly accrues during the demo.
- **Record a backup video** — a live fork demo can die on stage.

---

## Sequencing for a ~3-day hackathon

| Day | Work |
|---|---|
| Day 1 AM | Phase 0 spike. **Go/no-go decision.** |
| Day 1 PM | Phase 1 `deposit.ts` + `strategy.ts` + fork tests |
| Day 2 AM | Phase 1 `position.ts` + `unwind.ts` |
| Day 2 PM | Phase 2 rule engine + store; Phase 3 keeper skeleton |
| Day 3 AM | Phase 3 keeper end-to-end via session signer; Phase 4 scripts |
| Day 3 PM | Demo dry-runs, backup recording, README + architecture diagram |

---

## Bounties targeted

- **Build an Aqua App** — 1inch
- **Best financial flow** — Privy (embedded wallet + session signer, fully non-custodial)

## Open questions to close in Phase 0

- Confirm Aave v3 on Base lists both USDC and USDT (fallback: USDbC).
- Confirm the pegged strategy opcodes are in the pre-Fusaka `aquaInstructions` subset.
- Confirm Privy session signer can authorize `dock()` + `Aave.withdraw` with the user offline.

# Work log — AquaLadder

## 2026-09-08 — Phase 0 spike, items 1 & 2  ✅ PASS

**Goal:** de-risk items 1 & 2 of `plan.md` Phase 0 before building anything.

### Environment set up
- Cloned `1inch/aqua` + `1inch/swap-vm` → `../1inch-refs/` (reference; Solidity/Foundry, no TS tests).
- SDKs on npm: `@1inch/aqua-sdk@0.3.1`, `@1inch/swap-vm-sdk@0.4.1` (+ `@1inch/sdk-core`).
  - ⚠️ Their **ESM build is broken** (imports missing `.js` extensions). Use the **CJS** build — `require()` works, `import` does not.
- Spike code: `spike/phase0.cjs` (viem + the two SDKs, CJS). Repeatable.
- Fork: `anvil --fork-url https://base.drpc.org --fork-block-number <latest-30>`.
  - `base-rpc.publicnode.com` / `llamarpc` **reject archive requests** (403) — anvil needs archive state. Working archive RPCs for Base: `base.drpc.org`, `mainnet.base.org`, `base.meowrpc.com`.

### Item 1 — Aqua + AquaSwapVMRouter callable on a Base fork → **YES**
| Contract | Address (same on all 16 chains) | Bytecode on Base |
|---|---|---|
| Aqua registry | `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` | 5 619 bytes |
| AquaSwapVMRouter (the "app") | `0x111111338c5091E8440b67B168bAe16a668AC0De` | 20 541 bytes |
| SwapVM core (non-Aqua) | `0x111111... ` see SDK | n/a for us |

- `aqua.rawBalances(...)` and `router.ORDER_TYPEHASH()` read fine.
- SDK address maps contain **only mainnet chain IDs** (1, 10, 25, 56, 100, 130, 137, 143, 146, 324, 999, 4663, 8453, 42161, 43114, 59144). **No testnet.** → a **mainnet fork is the only path** for dev + demo. Confirmed.

### Item 2 — pegged strategy runs on today's (pre-Fusaka) deployment → **YES**
Full lifecycle round-tripped against the **live deployed** router bytecode on the fork, USDC/USDT (6-dec) pegged pair, ±0.5% band (`linearWidthFromSymmetricRangePercent(0.5)` → `linearWidth = 99.5e27`):

| Step | Result |
|---|---|
| SDK `order.encode()` hash | **matches** on-chain `router.hash(order)` byte-for-byte (`0x4e6fd8bf…`) |
| `aqua.ship(router, strategy, [USDC,USDT], [100k,100k])` | success, **82 137 gas** |
| virtual balances after ship | `USDC = USDT = 100 000e6` recorded in Aqua |
| maker wallet after ship | **unchanged** — ship is pure accounting, moves **no tokens** (confirmed in `Aqua.sol`) |
| `swapVM.quote()` (1 000 USDT → USDC) | executes the pegged VM program on live bytecode → **999.974999 USDC** (rate 0.99997) |
| `swapVM.swap()` from an **EOA taker** | settled, **156 497 gas**. taker +999.975 USDC; maker wallet 100 000→99 000.025 USDC / 100 000→101 000 USDT (Aqua `pull`/`push` straight against the wallet) |
| `aqua.dock(router, hash, [USDC,USDT])` | success, **35 860 gas**, instant |
| second `dock()` | **reverts** `DockingShouldCloseAllTokens` (`0xbbe8d44d`) — idempotency guard confirmed (item 5 preview) |

**Opcode set (`instructions.aquaInstructions`, 34 slots):** includes `peggedSwapGrowPriceRange2D` (idx 32), `concentrateGrowLiquidity2D` (18), `xycSwapXD` (17), `decayXD`, `flatFeeAmountInXD`, `aquaProtocolFeeAmountInXD`, `Controls.deadline`, `Controls.onlyTakerTokenBalanceGte`, `Controls.salt`. Everything AquaLadder's strategy + guards need — and the pegged opcode is **proven to execute**, not just present in the SDK table.

### Extra facts learned (feed into Phase 1)
- **`ship()` takes no tokens.** It writes `balances[maker][app][strategyHash][token]` and needs the maker to have `approve(AQUA, …)` beforehand so `pull()` can move tokens *during a swap*. This is the mechanic that makes "aToken keeps rebasing in the wallet while it's live liquidity" plausible — **still must be tested with a real rebasing aToken (item 3/4).**
- `strategy` bytes passed to `ship` = `abi.encode((maker, traits, data))` = `order.encode()`. `strategyHash = keccak256(strategyBytes)`.
- Strategy is immutable per hash (`StrategiesMustBeImmutable`) — use a `salt` in the program for uniqueness / re-shipping.
- EOA taker path works with just `USDT.approve(router)` + `TakerTraits.default()` — no taker contract / callback needed. Good for demo simplicity.
- `quote()` is `nonpayable` in the ABI but callable via `eth_call` for a read-only price.

### Go / no-go
**GO.** Core mechanic (ship → quote → swap → dock, pegged strategy, live contracts) works end to end on a Base fork. No blockers for Phase 1.

---

## 2026-09-08 (cont.) — Phase 0 spike, items 3, 4, 5  ✅ PASS

Spike rewritten in **TypeScript** (`spike/common.ts`, `spike/phase0.ts`, `spike/phase0b.ts`, `spike/run.sh`).
`phase0b.ts` covers items 3–5. All green.

### Reserve check (Aave v3 Base)
`Pool.getReservesList()` + config bitmap: **USDT is NOT listed on Aave v3 Base.** USDbC is
(active, unfrozen). Active USD stables on Aave v3 Base: **USDC**, **USDbC**, GHO, EURC, syrupUSDC.
→ pegged pair for the aToken test = **aUSDC (`0x4e65…5c0AB`) / aUSDbC (`0x0a1d…1D54`)**.
- Aave v3 Pool (Base): `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`

### Item 4 — aToken → Aqua approve + pull → **YES**
| Check | Result |
|---|---|
| `aUSDC.approve(Aqua, max)` | allowance set |
| `aqua.ship([aUSDC, aUSDbC], [100k, 100k])` | success, 82 281 gas; virtual balances recorded |
| `swapVM.swap()` 1 000 aUSDC → aUSDbC (EOA taker) | settled, **325 655 gas** (≈2× a plain-ERC20 swap — aToken transfers touch Aave's scaled-balance + index math) |
| effect | taker received **999.975 aUSDbC**; Aqua `pull`ed aUSDbC straight from maker wallet `100 000 → 99 000.025` |

*(The item-4 revert seen on the first attempt was a **test bug** — the taker had a 0 balance so the swap amount was 0. Not an aToken incompatibility.)*

### Item 3 — rebase test (the critical one) → **YES, the thesis holds**
Ship 50 000 aUSDC into a fresh strategy, **no swaps against it**, then `warp(+90 days)`:

| Check | Result |
|---|---|
| Aave normalized income index | rose `1.14498e27 → 1.15565e27` |
| maker aUSDC **wallet** balance | grew **+941.17 USDC** over 90 d (≈ 3.8 % APY on ~101 k) |
| Aqua **virtual** balance | **unchanged — exactly 50 000** (yield was *not* swept into the pool) |
| `swapVM.quote()` after the warp | still works, rate 0.99997 |
| `aqua.dock()` | success, 35 860 gas; maker keeps **101 941 aUSDC** — principal + 90 d yield, fully liquid |

**Conclusion:** the aToken keeps rebasing in the maker's wallet the whole time it is live
Aqua liquidity; Aqua's virtual balance is a fixed number and never touches the yield.
"One balance, two jobs" (Aave supply APY + Aqua fees) is **real**, not marketing.

### Item 5 — `dock()` idempotency & guards (keeper safety) → **YES**
After `dock()`:
- `rawBalances` → `tokensCount == 255` (`_DOCKED` marker)
- `safeBalances(...)` **reverts** (`SafeBalancesForTokenNotInActiveStrategy`)
- second `dock()` **reverts** (`DockingShouldCloseAllTokens`, `0xbbe8d44d`)
- `dock()` of a never-shipped hash **reverts**
- `swap()` against a docked strategy **reverts**

→ the keeper can retry `dock()` blindly; every stale path fails loudly instead of silently succeeding or double-spending.

### Extra facts learned (Phase 1)
- aToken swap gas ≈ 325 k vs ≈ 160 k for plain ERC-20 — budget for it in the keeper's gas estimates.
- `AquaPeggedAmmStrategy` takes `reserve` per leg = the shipped amount; the pegged curve runs on Aqua's **virtual** balances (`safeBalances`), never the wallet balance — which is exactly why rebase yield is invisible to the AMM math.
- USDbC balance storage slot on Base = **51** (USDC = 9); `deal()` in `common.ts` tries common slots first.
- Spikes now self-salt each run, but `run.sh` still starts a **fresh fork** per run for determinism.

### Phase 0 verdict
**All 5 items pass. Phase 0 complete. GO for Phase 1** — the only real risk left is economic
(depeg exit latency, thin stable-stable fee volume), not technical feasibility.

### How to reproduce
```bash
cd aqualadder/spike && npm install
npm run phase0     # items 1 & 2
npm run phase0b    # items 3, 4, 5
```

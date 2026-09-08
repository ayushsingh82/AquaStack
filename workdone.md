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

### Still open (next spike session — items 3, 4, 5 proper)
- [ ] Item 3: repeat with **real Aave aUSDC / aUSDT**, advance fork time so aTokens rebase, confirm quote/swap/dock still correct **and yield stays in the wallet** (not swept into the pool).
- [ ] Item 4: confirm aTokens `approve()` + Aqua `pull()` cleanly mid-swap (rebasing-balance edge cases).
- [ ] Item 5: formal `dock()` idempotency + "already docked" handling for the keeper (preview looks good).
- [ ] Confirm Aave v3 Base has both aUSDC and aUSDT listed (fallback aUSDbC).

### How to reproduce
```bash
anvil --fork-url https://base.drpc.org --fork-block-number $(( $(cast bn --rpc-url https://base.drpc.org) - 30 )) --silent &
cd aqualadder/spike && node phase0.cjs
```

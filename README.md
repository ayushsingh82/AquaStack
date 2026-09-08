# AquaLadder

**Deposit USDC once. The same balance earns Aave lending yield *and* provides
1inch Aqua liquidity at the same time — with an automated rule that exits the
position when the peg breaks.**

In normal DeFi, a dollar does one job: it's lent on Aave, *or* it's LP'd on a
DEX. You pick. AquaLadder runs both on a single balance, because 1inch Aqua makes
that possible.

---

## Why one balance can do two jobs

[1inch Aqua](https://1inch.com/aqua/) is a shared-liquidity layer. A maker
registers a *virtual* balance; the underlying tokens **never leave the maker's
wallet**. Aqua only moves them — via `pull()` / `push()` — at the instant a swap
actually settles against that maker.

That single property is the whole idea:

> The tokens sit in your wallet the entire time they're "providing liquidity."
> So they can be a **rebasing Aave aToken** — accruing supply interest in the
> wallet — *while* Aqua treats them as live liquidity. Aqua's virtual balance is
> a fixed number; the yield accrues on top and stays yours. Nothing is
> double-spent, because Aqua can only ever pull up to the virtual balance, and
> only during a real swap.

This is verified end-to-end against the live contracts on a Base fork — see
[What's verified](#whats-verified).

---

## How it works

```
                  ┌─────────────────────────────────────────┐
   USDC  ────────▶│  ½ swap → USDbC   ·   supply both to     │
                  │  Aave v3  →  aUSDC + aUSDbC (in wallet)  │
                  └────────────────┬────────────────────────┘
                                   │  approve → aqua.ship()
                                   ▼
        ┌──────────────────────────────────────────────────┐
        │   aUSDC / aUSDbC  —  one balance, two jobs        │
        │                                                  │
        │   ▸ keeps earning Aave supply APY (rebasing)      │
        │   ▸ registered as a 1inch Aqua pegged position    │
        │     → earns the pegged-curve spread on swaps      │
        └──────────────────────────┬───────────────────────┘
                                   │  readPosition() every N minutes
                                   ▼
        ┌──────────────────────────────────────────────────┐
        │   keeper: evaluate(rule)                          │
        │     hold  ·  alert  ·  unwind → aqua.dock()       │
        │                         (+ Aave withdraw → USDC)  │
        └──────────────────────────────────────────────────┘
```

1. **Split & supply** — half the USDC is swapped to USDbC; both halves are
   supplied to Aave v3 on Base, becoming `aUSDC` and `aUSDbC`.
2. **Ship to Aqua** — both aTokens are registered as a pegged AMM strategy
   (`aUSDC/aUSDbC`, a tight band around 1.0) with `aqua.ship()`. **No tokens
   move** — this is pure accounting.
3. **Earn on both sides** — each aToken keeps compounding Aave interest in the
   wallet; swaps routed through Aqua pay the position a spread.
4. **Protected exit** — a keeper evaluates the user's rule every few minutes and,
   when it triggers, calls `aqua.dock()` to release the position and (optionally)
   withdraws from Aave back to USDC.

### Walkthrough (from the fork tests)

| | |
| --- | --- |
| deposit | `1,000 USDC` |
| after split + supply + ship | `~495 aUSDC` + `~495 aUSDbC` shipped; `~5 aUSDC` stays liquid in-wallet |
| 40 days later | Aave yield brings total return to **+36 bps**; rule's take-profit is +20 bps |
| keeper fires | `dock()` + 2 × `Aave.withdraw` — 3 txs |
| back in wallet | **`502.05 USDC`** (principal + Aave yield + pegged spread) |

---

## The protective rule

Each position carries one `Rule`. Every threshold is optional; the first to fire
triggers an exit.

| field | meaning |
| --- | --- |
| `pegDeviationBps` | exit if the pool's live quote leaves ±this of 1:1 |
| `takeProfitBps` | exit once total return reaches +this (bps of principal) |
| `stopLossBps` | exit if total return drops to −this |
| `maxDrawdownBps` | exit if the drop from the best return seen exceeds this |
| `autoUnwind` | `true` → keeper unwinds; `false` → keeper only alerts |

`evaluate(PositionState, Rule)` is a pure function returning
`hold | alert | unwind`. Presets: `conservative`, `balanced`, `alertOnly`.

**What the rule does and doesn't do:** it exits *on a detected* depeg. By the
time the pool has visibly moved, arbitrage has already rotated it toward the weak
asset — the rule caps further bleeding, it does not prevent the loss already
priced in. The tagline is "auto-exits on depeg," not "protects before a loss."

---

## What's verified

Every layer is exercised against the **real deployed contracts** on a Base
mainnet fork (Aqua and SwapVM are mainnet-only — there is no testnet).

| Test | Proves |
| --- | --- |
| `npm run phase1:fork` | `buildDeposit()` → swap · supply · `ship()` round-trips; strategy hash matches the on-chain router; ship moves no tokens |
| `npm run phase1b:fork` | after 90 days the **Aave yield accrued in the wallet** while Aqua's virtual balance stayed fixed; `readPosition()` reports it; `buildUnwind()` returns principal + yield, fully liquid |
| `npm run phase2:test` | rule engine: all four thresholds, max-drawdown peak memory, docked → hold; both store implementations round-trip (bigint-safe) |
| `npm run phase3:fork` | keeper end-to-end: `hold` → threshold trips → `alert` (autoUnwind off) → `alert` (no signer) → `unwound` (3 txs, USDC returned) → terminal |

Earlier de-risking (Phase 0) also confirmed: rebasing aTokens `approve()` and
`pull()` cleanly through Aqua mid-swap; `dock()` is instant pure-accounting; and
every stale path (second `dock()`, dock-never-shipped, swap-after-dock) reverts.

---

## Architecture

```
src/lib/aqua/        on-chain integration — viem, server-only
  strategy.ts        buildPeggedStrategy()  → Aqua pegged AMM order + hash
  deposit.ts         buildDeposit()         → ordered TxSteps: swap · supply · ship
  position.ts        readPosition()         → PositionState: per-leg virtual vs
                     wallet balance, index-based Aave yield, Aqua PnL, live quote
                     → peg deviation, swap history from events
  unwind.ts          buildUnwind()          → dock (+ optional Aave withdraw);
                     idempotent (reports alreadyDocked)
  constants.ts       Base addresses + ABIs

src/lib/rules/       protective-rule engine — pure, no chain calls
  types.ts           Rule, RULE_PRESETS, PositionRecord, RuleStore
  evaluate.ts        evaluate(PositionState, Rule) → hold | alert | unwind
  store.ts           MemoryRuleStore · JsonFileRuleStore (bigint-safe JSON)

src/lib/keeper/      the automated watcher — glue over the three above
  run.ts             runKeeperOnce(deps)    → one pass over active positions
  tick.ts            tickPosition()         → readPosition · evaluate · act
  signer.ts          PositionSigner iface + LocalKeySigner (Privy impl = prod)
  notify.ts          Notifier + consoleNotifier

scripts/             fork tests + the pure unit test
```

**Non-custodial.** The user's own wallet is the Aqua maker; AquaLadder never
holds funds. The keeper acts through a session signer scoped to `dock()` and
Aave `withdraw()` only — nothing else.

### Deployed contracts — Base (chain 8453)

| Contract | Address |
| --- | --- |
| Aqua registry | `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` |
| AquaSwapVMRouter | `0x111111338c5091E8440b67B168bAe16a668AC0De` |
| Aave v3 Pool | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` |

---

## Honest limitations

- **Two yield sources, not three.** Aave supply APY per leg + the Aqua
  pegged-curve spread. The protective rule is risk management, not yield.
- **USDbC liquidity on Base is thin** — ~$15k in the deepest stable pool. The
  swap-based deposit is therefore demo-scale today. A production build mints the
  second leg through an **Aave borrow-loop** (supply `aUSDC`, borrow USDbC,
  supply that) instead of a DEX swap — the swap is isolated in one function, so
  this is a contained change.
- **`makerFeeBps` is 0.** `withFeeTokenIn()` on the pegged strategy makes the
  on-chain `swap()` revert (quote still works); the LP earns from the band
  spread instead until this is resolved.

---

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 0 | De-risk spike — Aqua + pegged strategy + aToken rebase + dock guards | ✅ |
| 1 | Integration library — `deposit` · `strategy` · `position` · `unwind` | ✅ fork-tested |
| 2 | Rule engine + store — `evaluate` · `RuleStore` | ✅ unit-tested |
| 3 | Keeper — `run` · `tick` · signer · notifier | ✅ fork-tested |
| — | Web UI — deposit flow, position dashboard, rule config | ⬜ |
| — | Privy session-signer wiring for a live keeper | ⬜ |

Working notes and findings: [`workdone.md`](./workdone.md).
Build plan: [`plan.md`](./plan.md).

---

## Development

Requires **Node 20+** and [Foundry](https://book.getfoundry.sh/) (`anvil`,
`cast`) for the fork tests.

```bash
npm install

npm run dev            # Next.js app — http://localhost:3000

npm run phase2:test    # rule engine — pure unit test, no fork
npm run phase1:fork    # deposit + strategy      ┐
npm run phase1b:fork   # position + unwind       ├─ end-to-end on a fresh Base fork
npm run phase3:fork    # keeper                  ┘
```

The `*:fork` scripts spin up a disposable `anvil` fork of Base mainnet, run the
test, and tear it down. Override the upstream RPC with `FORK_RPC=…`.

> **Note:** the `@1inch/*` SDKs ship a broken ESM build. `next.config.ts` lists
> them under `serverExternalPackages` so Next resolves them via CommonJS, and the
> Aqua library is **server-only** — never import it into a Client Component.

---

## Acknowledgements

Built at ETHGlobal for the **Build an Aqua App** (1inch) and **Best financial
flow** (Privy) tracks. Not affiliated with 1inch or Aave.

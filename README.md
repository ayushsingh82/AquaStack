# AquaLadder

**One stablecoin deposit that earns Aave lending yield and provides 1inch Aqua
liquidity at the same time, with an automated rule that exits the position on a
depeg.**

Built on [1inch Aqua](https://1inch.com/aqua/) — a shared-liquidity layer where a
maker's capital stays in their own wallet and is only moved at the moment a swap
executes. Because the liquidity never leaves the wallet, the same balance can be
supplied to Aave (as a rebasing aToken) *and* registered as Aqua liquidity. The
Aave interest accrues on the aToken in the wallet; Aqua only ever tracks a fixed
virtual balance and pulls against it during a swap.

## How it works

A deposit of USDC is turned into a two-sided, peg-pegged Aqua position:

1. **Split & supply.** Half the USDC is swapped to USDbC; both halves are supplied
   to Aave v3 on Base, yielding `aUSDC` and `aUSDbC`.
2. **Ship to Aqua.** Both aTokens are registered as a pegged AMM strategy
   (`aUSDC/aUSDbC`, tight band around 1.0) via `aqua.ship()`. No tokens move —
   this is pure accounting.
3. **Earn on both sides.** Each aToken keeps accruing Aave supply interest in the
   wallet. Swaps routed through Aqua pay the position a spread on the pegged
   curve.
4. **Protected exit.** A user-defined rule (peg deviation, take-profit,
   stop-loss, max-drawdown) is evaluated off-chain. When it triggers, a keeper
   calls `aqua.dock()` to release the position and, optionally, withdraws from
   Aave back to USDC.

### Scope and honest limitations

- **Two yield sources**, not three: Aave supply APY on each leg, plus the Aqua
  pegged-curve spread. The protective rule is risk management, not a yield.
- The rule **exits on a detected depeg** — it caps further loss, it does not
  prevent the loss already priced into the pool by the time it fires.
- **USDbC DEX liquidity on Base is thin** (~$15k in the deepest stable pool), so
  the swap-based deposit is currently demo-scale. A production build would mint
  the second leg through an Aave borrow-loop instead of a DEX swap. See
  [`workdone.md`](./workdone.md).

## Architecture

```
src/lib/aqua/            on-chain integration (viem, server-only)
  strategy.ts            buildPeggedStrategy() → Aqua pegged AMM order + hash
  deposit.ts             buildDeposit() → ordered TxSteps: swap · supply · ship
  position.ts            readPosition() → PositionState (balances, Aave yield,
                         Aqua PnL, live quote → peg deviation, swap history)
  unwind.ts              buildUnwind() → dock (+ optional Aave withdraw); idempotent
  constants.ts           Base addresses + ABIs

src/lib/rules/           protective-rule engine (pure, no chain calls)
  types.ts               Rule, RULE_PRESETS, PositionRecord, RuleStore
  evaluate.ts            evaluate(PositionState, Rule) → hold | alert | unwind
  store.ts               MemoryRuleStore, JsonFileRuleStore

scripts/                 fork tests and the pure unit test
```

The Aqua position is **non-custodial**: the user's own wallet is the Aqua maker;
AquaLadder never holds funds. The keeper acts through a scoped session signer
authorised only for `dock()` and Aave `withdraw()`.

### Deployed contracts (Base, chain 8453)

| Contract | Address |
| --- | --- |
| Aqua registry | `0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a` |
| AquaSwapVMRouter | `0x111111338c5091E8440b67B168bAe16a668AC0De` |
| Aave v3 Pool | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` |

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 0 | De-risk spike — Aqua + pegged strategy + aToken rebase + dock guards on a Base fork | ✅ complete |
| 1 | Integration library (`deposit`, `strategy`, `position`, `unwind`) | ✅ complete, fork-tested |
| 2 | Rule engine + store (`evaluate`, `RuleStore`) | ✅ complete, unit-tested |
| 3 | Keeper — cron: `readPosition` → `evaluate` → `buildUnwind` via session signer | ⬜ next |
| — | Web UI (deposit flow, position dashboard, rule config) | ⬜ |

Full working notes and findings: [`workdone.md`](./workdone.md). Build plan:
[`plan.md`](./plan.md).

## Development

Requires Node 20+ and [Foundry](https://book.getfoundry.sh/) (`anvil`, `cast`)
for the fork tests.

```bash
npm install

npm run dev            # Next.js app — http://localhost:3000

npm run phase2:test    # rule engine unit test (no fork)
npm run phase1:fork    # deposit + strategy, end-to-end on a fresh Base fork
npm run phase1b:fork   # position + unwind, end-to-end on a fresh Base fork
```

The `*:fork` scripts start a disposable `anvil` fork of Base mainnet, run the
test, and tear it down. Override the upstream RPC with `FORK_RPC=…`.

> The `@1inch/*` SDKs ship a broken ESM build; `next.config.ts` lists them under
> `serverExternalPackages` so Next resolves them via CommonJS. The Aqua library
> is server-only — do not import it into a Client Component.

## Acknowledgements

Targets the **Build an Aqua App** (1inch) and **Best financial flow** (Privy)
tracks. Built at ETHGlobal.

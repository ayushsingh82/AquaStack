# Pending — App UI (Phase 4)

Backend (Phases 0–3) is **done and fork-tested**: `buildDeposit`, `buildPeggedStrategy`,
`readPosition`, `buildUnwind`, `evaluate`, `RuleStore`, keeper (`runKeeperOnce` /
`tickPosition`). Landing page (`/`) is done.

**Foundation (1–5) is done** — the `/app` shell, wallet, server boundary and store
are wired. The deposit wizard, positions dashboard and keeper console are still pending.

---

## Foundation — ✅ DONE (not committed)
1. ✅ **Env + fork config** — `src/lib/chain.ts` (`forkChain`, id 8453, RPC → fork), `src/lib/server/client.ts` (`publicClient`), `.env.example`.
2. ✅ **Server boundary** — `src/lib/server/api.ts` (read helpers: `listPositions` · `getRecord` · `readPositionState` · `evaluateRecord`), `src/lib/server/serialize.ts` (bigint-safe `toClient`/`fromClient`), `src/lib/server/keeper-signer.ts`, `src/app/app/actions.ts` (`'use server'`: `prepareDeposit` · `buildShipStep` · `recordDeposit` · `saveRule` · `prepareUnwind` · `markUnwound` · `runKeeper`).
3. ✅ **Store wiring** — `src/lib/server/store.ts` → `ruleStore` = `JsonFileRuleStore` at `.data/positions.json` (gitignored).
4. ✅ **Wallet** — `src/components/app/Providers.tsx` (Privy + wagmi; **fallback**: no `NEXT_PUBLIC_PRIVY_APP_ID` → plain wagmi + injected wallet), `ConnectButton.tsx`. `.npmrc` `legacy-peer-deps=true`; `viem` pinned to `2.56.0`; `@stripe/stripe-js` added (Privy peer).
5. ✅ **App shell** — `src/app/app/layout.tsx` (sticky header: wordmark · Positions/New deposit/Keeper nav · "Base fork · 8453" badge · Connect button), `NavLink.tsx`, `/app` Positions placeholder.

## Deposit flow — pending
6. **`/app/deposit` step 1: amount** — USDC input, balance read, validation.
7. **`/app/deposit` step 2: strategy** — peg-band preset slider (tight / balanced / wide), shows band %.
8. **`/app/deposit` step 3: rule** — preset picker + custom thresholds (pegDeviation / takeProfit / stopLoss / maxDrawdown) + autoUnwind toggle.
9. **`/app/deposit` step 4: sign** — `buildDeposit`, walk the 9 steps as a progress checklist, read real aToken balances, `balancedShipStep`, sign the ship.
10. **Persist + redirect** — write `PositionRecord` (rule, principals, indices, deposit block, strategyBytes), go to detail.

## Positions — pending
11. **`/app` list** — `RuleStore.list({ user })`, row per position: status pill, principal, total return, peg deviation, rule summary.
12. **`/app` empty state** — CTA to `/app/deposit`.
13. **`/app/position/[hash]` balances panel** — per-leg virtual vs wallet aToken, principal, shipped amount.
14. **`/app/position/[hash]` yield panel** — Aave yield, Aqua PnL, total return bps.
15. **`/app/position/[hash]` peg gauge** — current quote / deviation, rule thresholds marked.
16. **`/app/position/[hash]` activity** — swaps count, pulled/pushed, keeper events.
17. **`/app/position/[hash]` edit rule** — inline form → update `PositionRecord`.
18. **`/app/position/[hash]` unwind now** — `buildUnwind` → sign steps → mark unwound.

## Keeper — pending
19. **`/app/keeper` run** — "Run keeper now" button → `runKeeperOnce` → show `TickResult[]`.
20. **`/app/keeper` verdict table** — per active position: hold / alert / unwind + reason + metrics.
21. **`/app/keeper` activity log** — history of runs / unwinds / alerts.
22. **Session signer** — Privy session signer authorize flow (or a local-key "demo keeper" fallback).

## Polish — pending
23. **Loading / error / toast states** across the flows.
24. **Seed script for the demo** — deposit + a counterparty doing swaps, so the dashboard shows live numbers.
25. **Depeg demo script** — push the pool off peg on the fork to show the rule fire.

---

## Minimum demo path
**1–12, 13–15, 18, 19–20, 24** → deposit a position, see it on the dashboard, run the keeper, watch it unwind, funds back in the wallet.

Everything else (16, 17, 21, 22, 23, 25) is polish.

## Also open (from earlier findings)
- **Swap vs Aave borrow-loop** for the second leg — USDbC DEX liquidity is thin (~$15k), so the swap-based deposit is demo-scale. Fine for the demo; a real product mints leg B via a borrow-loop.
- **`makerFeeBps` is 0** — `withFeeTokenIn()` makes the pegged `swap()` revert. LP earns from the band spread instead.

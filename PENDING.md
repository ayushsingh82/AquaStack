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

## Deposit flow — ✅ DONE (not committed)
`src/app/app/deposit/page.tsx` → `components/app/deposit/DepositWizard.tsx` (4-step
state machine) + `DepositSign.tsx` (tx orchestration). Client-safe helpers:
`lib/addresses.ts`, `lib/abis.ts`, `components/app/ui.tsx`. `serialize.ts` moved to `lib/`.

6. ✅ **step 1: amount** — USDC input, live balance via `useReadContract`, Max button, min-1 + ≤-balance validation.
7. ✅ **step 2: strategy** — tight / balanced / wide peg-band picker (±0.1 / 0.5 / 2.0 %) → `pegBand`.
8. ✅ **step 3: rule** — conservative / balanced / alertOnly presets + 4 editable bps threshold inputs + autoUnwind toggle → `Rule`.
9. ✅ **step 4: sign** — `prepareDepositAction` → sign the 8 pre-ship steps (wagmi `sendTransaction` + wait), read real aToken balances + Aave indices + block, `buildShipStepAction` → sign the ship, progress checklist + chain-switch prompt.
10. ✅ **persist + redirect** — `recordDepositAction` writes the `PositionRecord`, redirect to `/app`.

> Untested end-to-end — needs a running Base fork + a wallet on chain 8453. Typecheck clean, step 1 renders.

## Positions — 11–15 ✅ DONE (not committed) · 16–18 pending
Server actions `getPositionsAction` / `getPositionAction` (in `actions.ts`, use `evaluateRecord`).
`lib/format.ts` (client-safe `usd` / `bpsPct` / `shortHash` / `timeAgo`).

11. ✅ **`/app` list** — `components/app/positions/PositionsList.tsx`: rows with status pill, short hash, `$principal`, total-return bps (green/red), peg deviation, age. Row → `/app/position/[hash]`.
12. ✅ **`/app` empty state** — "No positions yet" + "Open your first position" CTA; plus a "connect a wallet" state.
13. ✅ **`/app/position/[hash]` balances panel** — `components/app/position/PositionDetail.tsx`: per-leg aUSDC/aUSDbC — wallet aToken vs Aqua virtual balance vs shipped, and the accrued gap.
14. ✅ **yield panel** — Aave interest (both legs), Aqua PnL (signed), total return (% + bps) on principal.
15. ✅ **peg gauge** — deviation bar with the rule's `pegDeviationBps` as a marker; quote a→b / b→a; swap count; shows the keeper verdict if the rule is tripped.

> ← last completed: **task 15**. Detail-page routes compile; connect/loading/not-found states render. Full panels need a fork + wallet + a real position to verify visually.

16. **`/app/position/[hash]` activity** — swaps count, pulled/pushed, keeper events.
17. **`/app/position/[hash]` edit rule** — inline form → `saveRuleAction`.
18. **`/app/position/[hash]` unwind now** — `prepareUnwindAction` → sign steps → `markUnwoundAction`.

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

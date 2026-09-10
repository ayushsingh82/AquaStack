# Pending — App UI (Phase 4)

Backend (Phases 0–3) is **done and fork-tested**: `buildDeposit`, `buildPeggedStrategy`,
`readPosition`, `buildUnwind`, `evaluate`, `RuleStore`, keeper (`runKeeperOnce` /
`tickPosition`). Landing page (`/`) is done.

**All 25 are done** (16–23 committed; 24–25 not committed): the `/app` shell,
deposit wizard, positions dashboard + detail page (activity / rule editor /
unwind), keeper console (run + verdict table + run history + signer status),
a toast system, and two demo fork scripts (`seed`, `depeg`). `next build` +
`tsc` (app + scripts) clean. Nothing below is verified against a live fork +
wallet yet — the fork scripts follow the proven phase1b/phase3 pattern but
have not been run.

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

## Positions — 11–15 committed · 16–18 committed
Server actions `getPositionsAction` / `getPositionAction` / `getKeeperVerdictsAction` (in `actions.ts`, use `evaluateRecord`).
`lib/format.ts` (client-safe `usd` / `bpsPct` / `shortHash` / `timeAgo`).
`lib/rule-form.ts` (shared `RuleForm` / `fromRule` / `toRule` / `ruleSummary` / `describeReason` — extracted from the deposit wizard).
`aqua/position.ts` gained an additive `PositionState.activity: PositionEvent[]` (ship / swap / dock logs, oldest-first) — `scripts/phase2.test.ts` factory updated to match.

11. ✅ **`/app` list** — `components/app/positions/PositionsList.tsx`: rows with status pill, short hash, `$principal`, total-return bps (green/red), peg deviation, age. Row → `/app/position/[hash]`.
12. ✅ **`/app` empty state** — "No positions yet" + "Open your first position" CTA; plus a "connect a wallet" state.
13. ✅ **`/app/position/[hash]` balances panel** — `components/app/position/PositionDetail.tsx`: per-leg aUSDC/aUSDbC — wallet aToken vs Aqua virtual balance vs shipped, and the accrued gap.
14. ✅ **yield panel** — Aave interest (both legs), Aqua PnL (signed), total return (% + bps) on principal.
15. ✅ **peg gauge** — deviation bar with the rule's `pegDeviationBps` as a marker; quote a→b / b→a; swap count; shows the keeper verdict if the rule is tripped.

16. ✅ **`/app/position/[hash]` activity** — `components/app/position/ActivityFeed.tsx`: swaps count + pulled/pushed volume, then a per-event list (ship / swap-in / swap-out / dock) from `pos.activity` with block numbers + tx hashes, an "opened" row, and the keeper's unwind tx hashes when unwound.
17. ✅ **`/app/position/[hash]` edit rule** — `components/app/position/RuleEditor.tsx`: collapsed rule summary → inline preset chips + 4 bps inputs + autoUnwind toggle → `saveRuleAction`, reloads on save.
18. ✅ **`/app/position/[hash]` unwind now** — `components/app/position/UnwindNow.tsx`: confirm → `prepareUnwindAction` (optional Aave withdraw toggle) → sign each step (wagmi) → `markUnwoundAction`; handles `alreadyDocked` and the terminal `unwound` state.

## Keeper — 19–20 committed · 21–22 ✅ DONE (not committed)
`/app/keeper` route → `components/app/keeper/KeeperConsole.tsx`.

19. ✅ **`/app/keeper` run** — "Run keeper now" → `runKeeperAction` (`runKeeperOnce`) → toast summary + each `TickResult` in the run history.
20. ✅ **`/app/keeper` verdict table** — `getKeeperVerdictsAction` dry-runs `evaluateRecord` over every active/alerting position (all users, no writes); table of position · status · return · peg dev · verdict (hold/alert/unwind) · reason.
21. ✅ **`/app/keeper` activity log** — `lib/server/keeper-log.ts` (`.data/keeper-log.json`, last 50 runs); `runKeeperAction` appends each pass; `getKeeperLogAction` → a "run history" list in the console (per-run: time, tick count, per-position action / detail / tx hashes).
22. ✅ **Session signer** — **Privy session signer wired**: `DelegateKeeper` (position detail) calls `useDelegatedActions().delegateWallet` and records `sessionSignerRef`; `keeper-signer.ts` prefers `privySessionSigner` (`@privy-io/server-auth` → `walletApi.ethereum.sendTransaction`, scoped to `dock()`/`withdraw()`) and falls back to the local `KEEPER_PRIVATE_KEY` demo key. Console shows both. Fork tests exercise the local-key path; the Privy path needs a real embedded wallet to demo.

## Polish — 23 ✅ DONE (not committed)
23. ✅ **Loading / error / toast states** — `components/app/Toast.tsx` (`ToastProvider` in `/app/layout.tsx` + `useToast()`); success/error toasts wired into the rule editor, unwind flow and keeper run. Loading/empty/error states already on every list + panel.

## Demo scripts — 24–25 ✅ DONE (not committed, not yet run on a fork)
`scripts/demo-common.ts` (shared: `openPosition` writes to the app's `.data/positions.json`, `fundTaker`, `takerSwap`, `warpDays`). `run-fork.sh` now forwards extra args.

24. ✅ **Seed script** — `scripts/seed.fork.ts` (`npm run seed:fork`): opens a 400-USDC position (balanced rule), funds a counterparty, runs 4 rounds of back-and-forth aUSDC↔aUSDbC swaps with +2d warps, prints the resulting swap count / fee PnL / Aave yield. Start the app on the same fork to see it live.
25. ✅ **Depeg script** — `scripts/depeg.fork.ts` (`npm run depeg:fork`, `-- --run-keeper` to also fire the keeper headless): opens a tight-rule position (`pegDeviationBps 25`, autoUnwind), a whale dumps ~120 aUSDbC one-way, prints before/after peg deviation + the `unwind` verdict; presenter then hits "Run keeper now" to watch the `dock()`.

---

## Minimum demo path — ✅ all pieces built
**1–20** → deposit a position, see it on the dashboard, run the keeper, watch it
unwind, funds back in the wallet. `seed:fork` (24) pre-populates live numbers;
`depeg:fork` (25) triggers the rule on stage.

## Also open (from earlier findings)
- **Swap vs Aave borrow-loop** for the second leg — USDbC DEX liquidity is thin (~$15k), so the swap-based deposit is demo-scale. Fine for the demo; a real product mints leg B via a borrow-loop.
- **`makerFeeBps` is 0** — `withFeeTokenIn()` makes the pegged `swap()` revert. LP earns from the band spread instead.

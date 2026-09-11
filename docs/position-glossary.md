# Reading a position — what every field on the page means

This walks through every number and label you'll see on the position detail
page (`/app/position/[hash]`) and the deposit wizard, in plain English.

---

## bps — the one thing to know first

**bps = basis points.** 1 bps = 0.01%. 100 bps = 1%.

Used everywhere here instead of `%` because the moves being measured are
small and precision matters — "75 bps" is less ambiguous than "0.75%" when
you're eyeballing a live number.

| bps | % |
| --- | --- |
| 1 | 0.01% |
| 30 | 0.3% |
| 75 | 0.75% |
| 150 | 1.5% |
| 500 | 5% |

---

## Deposit wizard

**Peg band** — how tight the pegged AMM concentrates liquidity around a 1:1
price.
- **Tight (±0.1%)** — the pool only quotes within 0.1% of 1:1. Captures more
  fee/spread per dollar of liquidity, but any real wobble pushes the price
  outside the band fast.
- **Balanced (±0.5%)** — the default. Room to absorb normal swap flow before
  the price moves meaningfully.
- **Wide (±2%)** — only reacts to an actual depeg event, ignores noise.

This is a property of the AMM curve itself, set once at deposit and baked
into the strategy — it's not the same as the rule's peg-deviation threshold
below (though they should usually be set to complementary values).

---

## Position card (dashboard list)

- **Status** — `Active` (shipped, live in Aqua), `Alerting` (a rule tripped
  but auto-unwind is off, so the keeper is just flagging it), `Unwound`
  (docked, funds back in your wallet).
- **Principal** — the dollar value you originally shipped (both legs
  combined), at deposit time. Doesn't move — it's the baseline everything
  else is measured against.
- **Return %** — total return so far, see "Total return" below.
- **Peg** — current peg deviation in bps, see "Peg deviation" below.
- **Strategy hash** — the unique on-chain ID of your Aqua strategy (this is
  what `dock()`, swaps, and the read model all key off).

---

## Balances panel

For each leg (aUSDC and aUSDbC — on Base Sepolia, aUSDbC is actually aUSDT):

- **`$X in wallet`** — your current on-chain aToken balance. This is a
  **rebasing** balance — it grows on its own as Aave interest accrues, with
  no action from you.
- **`virtual (Aqua) $Y`** — the fixed balance Aqua has registered for this
  strategy (set once at `ship()`, changes only when a swap pulls/pushes
  against it). This is what actually backs swaps.
- **`shipped $Z`** — the amount you shipped into the position originally
  (equal to `virtual` right after deposit; they diverge once swaps happen).
- **`+ $N accrued`** — wallet balance minus virtual balance. Since the
  wallet balance rebases up with Aave interest but the virtual (Aqua) balance
  doesn't, this gap **is** your Aave yield, visible directly as a growing
  number.

> **Why this works at all:** the aToken never leaves your wallet. Aqua just
> tracks a fixed virtual number and is only allowed to `pull()` up to that
> number, only at the instant a swap settles. So the token can rebase
> (earning Aave interest) and back Aqua liquidity at the same time — nothing
> is double-counted.

---

## Yield panel

- **Aave interest (both legs)** — total Aave supply interest earned across
  both legs, in dollars. Comes from comparing the current Aave reserve index
  to the index at the moment you shipped (`getReserveNormalizedIncome`).
  Grows continuously; on a short demo window this will be close to $0.
- **Aqua PnL (spread − drift)** — profit or loss from swaps that happened
  against your pegged pool. Every swap sends you the "wrong" token at a
  slightly favorable rate (the pegged curve's spread), which usually nets
  positive; "drift" is the inventory imbalance that builds up if swaps keep
  flowing one direction. Can be negative if a lot of one-directional flow
  moved your inventory unfavorably.
- **Total return** — `Aave interest + Aqua PnL`, expressed as bps of
  principal. This is the number the rule's `takeProfitBps` / `stopLossBps`
  actually watch.

---

## Peg & rule panel

- **Peg deviation (current)** — how far off 1:1 the pegged pool's live quote
  currently is, in bps. Read from an actual quote probe against the AMM, not
  an oracle. 0 bps = perfectly balanced.
- **The marker line / "exit at N bps"** — your rule's `pegDeviationBps`
  threshold. If the current deviation reaches this, the rule fires.
- **`quote a→b` / `quote b→a`** — the live exchange rate the pool would give
  you right now for a small probe swap in each direction. Should sit very
  close to `1.00000` when the peg is healthy.
- **swaps** — how many taker swaps have settled against this position since
  it was shipped.

### Rule fields

- **Peg deviation (bps)** — exit if the peg moves this far from 1:1.
  E.g. `75` = exit once the pool is 0.75% off balance.
- **Take profit (bps)** — exit once total return reaches this many bps of
  principal. `off` = no profit target, let it run.
- **Stop loss (bps)** — exit if total return drops to **negative** this
  value. E.g. `150` means exit at −1.5% return. (Entered as a positive
  number; the rule applies it as a floor below zero.)
- **Max drawdown (bps)** — exit if return falls this far from its own
  best-ever value (not from zero). E.g. if return peaked at +80 bps and then
  fell to +30 bps, that's a 50 bps drawdown. Protects gains even if the
  position is still net positive.
- **Auto-unwind** — if any threshold above trips:
  - **on** → the keeper signs the unwind transactions itself (dock + Aave
    withdraw), fully automatically.
  - **off** → the keeper only flags the position as `Alerting`; you unwind
    manually.

**Every evaluation checks all four thresholds; the first one(s) that fire
determine the action.** Only the fields you set are checked — leave a field
`off` to disable that check entirely.

### Presets

| Preset | Peg dev. | Stop loss | Max drawdown | Auto-unwind |
| --- | --- | --- | --- | --- |
| **Conservative** | 30 bps | 50 bps | 40 bps | yes |
| **Balanced** | 75 bps | 150 bps | — | yes |
| **Alert only** | 50 bps | — | — | **no** |

---

## Keeper console

- **"Run keeper now"** — a dry-run evaluation pass over every position (or a
  live pass with `--run-keeper` from the CLI): reads on-chain state,
  evaluates the rule, and either does nothing (`hold`), flags it
  (`alert`), or signs the unwind (`unwind`) — depending on the verdict and
  whether auto-unwind is on.
- **Verdict `hold`** — no threshold has fired. Normal state most of the time.
- **Verdict `alert`** — a threshold fired but auto-unwind is off; status
  flips to `Alerting`, no txs are sent.
- **Verdict `unwind`** — a threshold fired and auto-unwind is on; the keeper
  signs `dock()` + Aave `withdraw()` for you.
- **Signer** — what the keeper uses to sign unwind transactions:
  - `privy-session` — a Privy delegated session signer, scoped to only
    `dock()` and `withdraw()` on your embedded wallet. This is what lets the
    keeper act **while you're offline** without ever holding your keys.
  - `local-key` — a single demo key (`KEEPER_PRIVATE_KEY`) signing for
    everyone, used as a fallback when no position has delegated a signer.
  - `none` — no signer configured; the keeper can only alert, never unwind.

---

## Activity feed

- **Shipped to Aqua** — the deposit's `ship()` transaction.
- **Swap — received** — a taker swap where this position received a token
  (its balance grew on that leg).
- **Swap — paid out** — a taker swap where this position sent a token out
  (its balance shrank on that leg). Every swap shows up as one "received" +
  one "paid out" event (the two legs of the same trade).
- **Docked (unwound)** — the `dock()` transaction that closed the position.
- **`pulled $X` / `pushed $Y`** (summary line above the feed) — total amount
  Aqua has ever pulled from vs. pushed to this position across all swaps.

---

## Unwind

Unwinding does three things, in order:
1. **`dock()`** — tells Aqua to stop treating this strategy as live liquidity
   (frees the virtual balance).
2. **Repay any variable debt** (only if a taker swap left one leg borrowed —
   happens on some swap directions) via `repayWithATokens`.
3. **Withdraw both legs from Aave** back to plain underlying tokens (USDC /
   USDT) in your wallet.

After unwinding, status becomes `Unwound`, and the position's final on-chain
state shows the aToken balance at 0 (fully withdrawn) — principal + any
accrued Aave yield + any Aqua spread, all back in your wallet in one shot.

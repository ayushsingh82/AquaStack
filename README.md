# AquaLadder

> Deposit once. Your money works multiple jobs at once — not one.

AquaLadder is a consumer-facing DeFi web app. Instead of choosing a single
protocol for a single pile of money, one deposit is put to work across three
yield sources simultaneously, on the same balance.

## The idea

In a normal DeFi app you pick one protocol per pile of money: lend on Aave, *or*
provide liquidity on a DEX, *or* something else. AquaLadder stacks these on a
single balance.

**Flow:**

1. User deposits stablecoins.
2. Deposit is converted to Aave **aTokens** → earning Aave lending yield.
3. That same aToken balance **backs a concentrated-liquidity position on
   Aqua / SwapVM** → earning swap fees.
4. A custom **stop / unwind rule** monitors the position and protects it.

Three yield sources, one balance, nothing split up.

## Why now (the moat)

- **1inch Aqua** only opened developer access in **Nov 2025**, with no consumer
  frontend live yet — essentially zero competition built on it.
- Aqua's own docs already describe backing positions with Aave aTokens
  ("collateral loops"), which is exactly the mechanic AquaLadder relies on.

## Bounties targeted

- **Build an Aqua App** — 1inch
- **Best financial flow** — Privy

## Status

Early scaffold. Next.js app initialized; product flow and integrations not yet
built.

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

# Hackathon — targeted bounty tracks

Two sponsors. AquaStack must satisfy the qualification lists below.

---

## 1inch — Aqua ($7,000 pool)

**About:** 1inch unifies DeFi liquidity (DEX aggregator since 2019). *Aqua*
reimagines DEX design with self-custodial liquidity provisioning — earn yield on
tokens without depositing them into another contract.

### 💧 Build an Aqua App — $5,000 (1st $2,500 · 2nd $1,500 · 3rd $1,000)

Create a custom Aqua app that implements a **sophisticated DeFi position**. If you
use SwapVM you may modify SwapVM opcodes and define your own instructions. Final
positions must be demonstrated through **test scripts or a UI**.

> Projects that utilize **SwapVM** are scored higher in final judging.

**Qualification requirements**
- [ ] Official Aqua / SwapVM contracts used (a redeploy of a *modified* SwapVM is allowed)
- [ ] On-chain execution of token transfers shown in the final demo (local forks are OK)
- [ ] Proper git commit history — **no single-commit entries on the final day**
- [ ] Position demonstrated via test scripts and/or UI

### 💦 Build an Aqua App — Continuity Track — $2,000 (1st $1,500 · 2nd $500)

Same brief and same qualification requirements, **Continuity Track participants only**.

### Resources
- SwapVM contracts — https://github.com/1inch/swap-vm/tree/main
- Aqua contracts — https://github.com/1inch/aqua
- Aqua SDK — https://github.com/1inch/sdks/tree/master/typescript/aqua

### How AquaStack qualifies
- Uses the **official** Aqua registry + AquaSwapVMRouter on Base (no redeploy) —
  `src/lib/aqua/constants.ts`.
- The "sophisticated position": a single stablecoin balance is **simultaneously**
  an Aave v3 supply position (rebasing aToken) **and** an Aqua pegged-AMM maker
  position — `buildPeggedStrategy` ships aUSDC/aUSDbC as `AquaPeggedAmmStrategy`.
- **SwapVM**: the pegged strategy runs SwapVM opcodes (`peggedSwapGrowPriceRange2D`,
  proven executing in the Phase 0 spike). We consume SwapVM via `@1inch/swap-vm-sdk`;
  we do **not** modify opcodes.
- On-chain transfers shown: `npm run phase1:fork` / `phase1b:fork` / `phase3:fork`
  round-trip `ship → swap → dock` + Aave supply/withdraw against the live
  contracts on a Base mainnet fork; plus the app UI (`/app`).
- Commit history: incremental, task-by-task (see `git log`).

**Gap / to strengthen:** judging favours SwapVM customisation — we use stock
opcodes. Consider defining one custom instruction (e.g. a peg-band that also
reads a Chainlink feed) if time allows.

---

## Privy ($5,000 pool)

**About:** Privy = flexible auth + embedded self-custodial wallets + wallet
interactions across web/mobile, no seed phrases.

### 🏢 Best B2B financial product — $2,500

Help **businesses** manage digital assets / financial operations with Privy —
treasury platforms, business accounts, payroll, spend management, payment ops,
shared org wallets.

**Qualification requirements**
- [ ] Integrate Privy as a **core** part of the product
- [ ] Create or use **at least one Privy wallet**
- [ ] Demonstrate a **business / organization** use case
- [ ] At least one **functional B2B workflow** (payment, approval, treasury op, wallet admin)
- [ ] Use at least one **Privy control** — policies, signers, key quorums, or intents
- [ ] Working demo + source code
- [ ] Clearly explain how Privy enables the product

### 💸 Best financial flow — $2,500

A seamless experience for **funding, moving, trading, growing, or spending**
digital assets with Privy — payments, remittances, cross-chain, stablecoin
conversions, swaps, savings, payouts, card-like spend.

**Qualification requirements**
- [ ] Integrate Privy as a **core** part of the product
- [ ] Create or use **at least one Privy wallet**
- [ ] Complete **at least one functional financial flow** using a **generally
      available** Privy feature (transfers, bridging, stablecoin conversions,
      swaps, self-service Earn vaults, onramps, other supported wallet actions)
- [ ] Working demo + source code
- [ ] Clearly explain how Privy improves UX
- [ ] Note: features needing commercial/guided onboarding may be **mocked** but
      **do not count** as the required functional integration. Privy Cards needs
      guided onboarding → a mocked card is OK but you still need another **live**
      Privy flow.

### Where AquaStack stands on Privy (as of this file)

**Integrated:**
- `PrivyProvider` + `@privy-io/wagmi` wired in `src/components/app/Providers.tsx`
  (embedded wallet, `createOnLogin: 'users-without-wallets'`, Base fork chain).
- `ConnectButton` uses `usePrivy()` login/logout + reads `user.wallet.address`.
- All deposit / unwind transactions sign through wagmi, which routes to the Privy
  embedded wallet when Privy is enabled.

**Not done yet (blockers for a clean Privy submission):**
1. **Privy is gated off.** `PRIVY_ENABLED` is false without
   `NEXT_PUBLIC_PRIVY_APP_ID`; right now the app falls back to an injected
   wallet. Need a real Privy app id + demo with Privy actually on.
2. **No Privy "control".** The keeper's autonomous `dock()` while the user is
   offline is the headline story — it should use a **Privy session signer**
   (delegated action) scoped to `dock()` + `withdraw()`. Today
   `keeper-signer.ts` only has a local-private-key fallback; `sessionSignerRef`
   on `PositionRecord` is unused. This is the single most valuable thing to build
   for either Privy track.

### Target: which Privy prize

**Best financial flow** is the natural fit — "growing" digital assets (yield) +
a protected exit is a financial flow, and the deposit wizard hides the 9-tx
on-chain complexity behind Privy. **B2B** would need an org-wallet / multi-user /
approvals framing we don't have.

---

## Combined demo checklist

- [ ] Base fork running; deposit a position live through the **Privy** embedded wallet
- [ ] Show the position on `/app` — Aave yield + Aqua spread accruing (`seed:fork`)
- [ ] Trip the rule (`depeg:fork`) → keeper unwinds via a **Privy session signer** → funds back
- [ ] `git log` clean and incremental
- [ ] README explains both integrations

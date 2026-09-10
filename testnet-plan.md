# AquaLadder on Base Sepolia — deploy + demo plan

**Decision:** demo on a real public testnet (Base Sepolia, chain **84532**), not a
fork. That means deploying Aqua + the SwapVM router ourselves — the 1inch bounty
allows redeploys ("redeployments of a modified SwapVM contract is allowed").

**Everything above the contract layer is already built and chain-agnostic** —
deposit wizard, position read model, rule engine, keeper, Privy wallet. The new
work is: (1) contracts on Sepolia, (2) drop the Aerodrome half-swap from
`deposit.ts`, (3) swap addresses in `constants.ts`, (4) point `.env` at Sepolia.

---

## What already exists on Base Sepolia

| Piece | Status |
| --- | --- |
| **Aave v3** | ✅ deployed on Base Sepolia (84532) — pool, aTokens, a faucet for test assets |
| **1inch Aqua registry** | ❌ mainnet only — we deploy it |
| **AquaSwapVMRouter** | ❌ mainnet only — we deploy it |
| **Pegged pair tokens** (aUSDC / aUSDbC) | ❌ no USDbC on Sepolia — use Aave's aUSDC + a second Aave stable (aUSDT / aDAI), or mock tokens |
| **Aerodrome** (the ½-swap DEX) | ❌ mainnet only — we remove that step |

Repos (both public):
- `github.com/1inch/swap-vm` — Solidity 0.8.30, Hardhat 3 + Ignition. `DEPLOY.md` has a `sepolia` target; adding `baseSepolia` to `hardhat.config.ts` is one line. `AquaSwapVMRouter` constructor takes `{ aqua, weth, owner, name, version }` — **so Aqua must be deployed first.**
- `github.com/1inch/aqua` — Foundry + Make. `make deploy-aqua-router`, env `OPS_NETWORK` / `OPS_CHAIN_ID` / `<NET>_RPC_URL` / `<NET>_PRIVATE_KEY`.

---

## The one blocking unknown — de-risk FIRST

The SDK we use (`@1inch/swap-vm-sdk@0.4.1`) encodes the pegged-strategy program
(`peggedSwapGrowPriceRange2D`, opcode idx 32). If the SwapVM commit we deploy has
a **different opcode set / index**, SDK-encoded programs will revert on-chain and
there is **no fix short of also patching SwapVM**.

`plan.md` Phase 0 already flagged this: *"Confirm the pegged strategy opcodes are
in the pre-Fusaka aquaInstructions subset."*

**→ Phase A below answers this in one afternoon. Do not start Phase B until A passes.**

---

## Phases & priorities

### Phase A — De-risk spike · **P0** · ✅ **DONE — PASSED**
*Goal: prove `deploy → SDK-encode → ship → quote → swap → dock` round-trips on Base Sepolia.*

**Result (run on an anvil fork of Base Sepolia, chain 84532):**
- **Version match:** `swap-vm@v1.0.2` `AquaOpcodes.sol` opcode array is byte-identical to
  installed SDK `@1inch/swap-vm-sdk@0.4.1` `aquaInstructions`
  (`peggedSwapGrowPriceRange2D` at index 31 in both). swap-vm v1.0.2 pins `@1inch/aqua#0.1.0`.
- Both repos `npm install` + `forge build` clean.
- Deployed to the fork:
  - `AquaRouter` (= the Aqua registry) — `forge script DeployAquaRouter` from `1inch/aqua@main`, constructor `(owner)`
  - `AquaSwapVMRouter` — `forge script DeployAquaSwapVMRouter` from `1inch/swap-vm@v1.0.2`, constructor `(aqua, weth=0x4200…0006, owner, "AquaSwapVMRouter", "1.0.2")`
  - 2× `MockToken` (plain ERC-20 + open mint, 6dp)
- `scripts/spike-sepolia.ts` round-trip: `order.encode()` (706 bytes) → `aqua.ship()` (82k gas)
  → wallet tokens **unchanged** by ship (virtual balances ✓) → `quote` = 0.999999 → taker
  `swap()` (settled, Aqua pulled from maker) → `aqua.dock()` (36k gas) → maker fully liquid.

**→ GO for Phase B.** Config files used: `aqua/config/constants.json` `{owner:{84532:…}}`,
`swap-vm/config/constants.json` `{aqua, weth, owner, swapVmRouterName, swapVmRouterVersion}` per chainid.

Original step list (for reference):

1. Find the SwapVM + Aqua git ref that matches SDK `0.4.1` / aqua-sdk `0.3.1`
   (check repo releases / tags / CHANGELOG — **not `main`** unless it matches).
2. `forge build` (aqua) + `npm i && npx hardhat compile` (swap-vm) at that ref.
3. Deploy to Base Sepolia, in order:
   - Aqua registry
   - `AquaSwapVMRouter(aqua=<above>, weth=<Base Sepolia WETH>, owner=<us>, …)`
4. Deploy **2 mock rebasing ERC-20s** (`MockAToken`, open `mint()` + admin `accrue()`) — fastest, skip Aave for the spike.
5. Throwaway script: `AquaPeggedAmmStrategy.new(...).build()` → `order.encode()` →
   `aqua.ship()` → `SwapVMContract.encodeQuoteCallData()` → a taker `swap()` → `aqua.dock()`,
   with **all SDK addresses overridden** to our deployed ones.
6. **PASS** = the swap settles and `dock()` frees the balance → **GO to Phase B.**
   **FAIL** at opcode encoding → stop, fall back (see ladder below).

**Need from you:** a throwaway deployer key + ~0.2 Base Sepolia ETH (faucet:
`alchemy.com/faucets/base-sepolia`, `basefaucet.com`), an Alchemy/Infura Base
Sepolia RPC URL, an Etherscan (Basescan) API key for verification.

---

### Phase B — Core contracts on Sepolia · **P0** · ~4–6 h
*Only starts if Phase A passed.*

1. Deploy the real set to Base Sepolia: Aqua registry, AquaSwapVMRouter.
2. Pegged-pair tokens — **primary:** use Aave v3 Base Sepolia — supply test
   USDC + test USDT (from Aave's faucet) → `aBasSepUSDC` / `aBasSepUSDT`.
   **fallback:** the mock `MockAToken`s from Phase A with a scripted `accrue()`.
3. Update `src/lib/aqua/constants.ts` — `AQUA`, `AQUA_SWAP_VM_ROUTER`,
   `AAVE_POOL`, `aUSDC`, `aUSDbC` (→ the second token), `USDC`, `USDbC`.
4. Verify all contracts on Basescan (nice for judges).
5. Commit the deploy addresses + a `deployments/base-sepolia.json`.

---

### Phase C — App wiring · **P0/P1** · ~4 h

1. **`.env`** → `RPC_URL` / `NEXT_PUBLIC_RPC_URL` = Base Sepolia RPC,
   `NEXT_PUBLIC_CHAIN_ID=84532`. `chain.ts` already reads these.
2. **`deposit.ts`** (P0) — remove the Aerodrome ½-swap. New shape:
   `buildDeposit(user, usdcAmount, usdtAmount)` → supply both to Aave → approve →
   `aqua.ship()`. (Demo: user gets both test tokens from the faucet.)
3. **Privy** (P1) — add Base Sepolia to `supportedChains` / `defaultChain` in
   `Providers.tsx`; confirm the embedded wallet can sign on 84532.
4. **`position.ts` / `unwind.ts`** — should need no change (address-driven), but
   re-test the read model + dock against the live Sepolia contracts.

---

### Phase D — Demo data + scripts · **P1** · ~2–3 h

1. Rework `scripts/demo-common.ts` `deal()` → a real faucet/mint call
   (mock token `mint()`, or Aave faucet) instead of `anvil_setStorageAt`.
2. `seed.fork.ts` → `seed.sepolia.ts`: open a position + a counterparty doing
   swaps + real time passing (or `accrue()` on the mock aToken) so the dashboard
   shows non-zero yield + fees.
3. `depeg.sepolia.ts`: a whale swap that pushes the pegged pool off 1:1 → keeper unwinds.

---

### Phase E — Keeper session signer + frontend deploy · **P1/P2** · ~half day

1. **Privy session signer** (`keeper-signer.ts`) — replace the local-key stub with
   a Privy delegated-action signer scoped to `dock()` + `withdraw()`. This is the
   headline Privy-bounty feature and the "auto-exit while offline" story.
2. Deploy the frontend to **Vercel** with the Sepolia env vars → one shareable link.
3. `PENDING.md` task 22 gets closed here.

---

### Phase F — Polish · **P2**

- Landing/README: swap "Base mainnet" → "Base Sepolia", update contract addresses,
  update the mermaid diagram.
- Loading/error states on the new deposit shape.
- **Record a backup demo video** — a live testnet demo can still fail on stage.
- `/code-review` pass on the contract-facing changes.

---

## Fallback ladder (if Phase A fails at opcode encoding)

| Fallback | What it costs | Bounty impact |
| --- | --- | --- |
| **1. Also fork + patch SwapVM** to add/realign the pegged opcode | +1 day, real Solidity risk | still "modified SwapVM" — 1inch OK |
| **2. Hand-rolled minimal pegged AMM** (`~150 LOC`: `ship`/`swap`/`dock`, pull-on-settle) on Sepolia | ~half day | **not official Aqua → fails the 1inch Aqua bounty**; still valid for Privy "financial flow" |
| **3. Back to Railway/anvil fork** of Base mainnet (real Aqua, hosted RPC) | ~2 h | full 1inch + Privy eligibility; "fork not testnet" is the only knock, and 1inch explicitly allows forks |

**Recommendation if A fails:** fallback **3** — a hosted anvil fork keeps *both*
bounties fully in play; a hand-rolled AMM throws the 1inch bounty away.

---

## Timeline (≈2.5 days)

| Day | Work |
| --- | --- |
| **Day 1 AM** | Phase A spike → **GO / NO-GO** |
| **Day 1 PM** | Phase B (contracts) + start Phase C (env + `deposit.ts`) |
| **Day 2 AM** | Finish Phase C, Phase D (seed + depeg scripts), full flow works on Sepolia |
| **Day 2 PM** | Phase E — Privy session signer, Vercel deploy |
| **Day 3 AM** | Phase F — README, polish, **backup video**, dry-runs |
| **Day 3 PM** | Buffer / real demo |

---

## What I need from you before I start Phase A

1. Throwaway **deployer private key** + fund it with ~0.2 Base Sepolia ETH
   (faucet links above).
2. A **Base Sepolia RPC URL** (Alchemy / Infura / `sepolia.base.org`).
3. A **Basescan API key** (for contract verification — optional but nice).
4. Confirm you're OK with ~2.5 days on this and the fallback-3 plan if the spike fails.

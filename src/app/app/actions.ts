'use server';

import { revalidatePath } from 'next/cache';
import type { Address, Hex } from 'viem';
import { ruleStore } from '@/lib/server/store';
import { publicClient } from '@/lib/server/client';
import { keeperSignerFor } from '@/lib/server/keeper-signer';
import { evaluateRecord } from '@/lib/server/api';
import { toClient } from '@/lib/serialize';
import { buildDeposit, type DepositInput } from '@/lib/aqua/deposit';
import { aUSDC, aUSDbC, AQUA, AQUA_SWAP_VM_ROUTER, AQUA_ABI } from '@/lib/aqua/constants';
import { buildUnwind } from '@/lib/aqua/unwind';
import { runKeeperOnce, consoleNotifier, type KeeperDeps } from '@/lib/keeper';
import type { PositionRecord, Rule } from '@/lib/rules';
import { encodeFunctionData } from 'viem';

const USDC_LEG = { token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address, aToken: aUSDC, decimals: 6 };
const USDbC_LEG = { token: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' as Address, aToken: aUSDbC, decimals: 6 };

/** Task 9: build the ordered deposit tx plan for the client to sign. */
export async function prepareDepositAction(input: {
  user: Address;
  usdcAmount: string; // base units
  pegBand?: DepositInput['pegBand'];
  rule: Rule;
  swapSlippageBps?: number;
}) {
  const plan = buildDeposit({
    user: input.user,
    usdcAmount: BigInt(input.usdcAmount),
    pegBand: input.pegBand,
    swapSlippageBps: input.swapSlippageBps,
  });
  return toClient({
    strategyHash: plan.strategyHash,
    strategyBytes: plan.strategy.strategyBytes,
    salt: plan.strategy.salt,
    pegBand: plan.strategy.pegBand,
    planned: plan.planned,
    steps: plan.steps,
    shipStepIndex: plan.shipStepIndex,
  });
}

/** Task 9: after the supplies land, build the ship tx with the real aToken balances. */
export async function buildShipStepAction(strategyBytes: Hex, aUsdcAmount: string, aUsdbcAmount: string) {
  const amt = BigInt(aUsdcAmount) < BigInt(aUsdbcAmount) ? BigInt(aUsdcAmount) : BigInt(aUsdbcAmount);
  const data = encodeFunctionData({
    abi: AQUA_ABI,
    functionName: 'ship',
    args: [AQUA_SWAP_VM_ROUTER, strategyBytes, [aUSDC, aUSDbC], [amt, amt]],
  });
  return toClient({ to: AQUA, data, value: 0n, shipped: amt });
}

/** Task 10: persist the position record once the ship tx is mined. */
export async function recordDepositAction(rec: {
  user: Address;
  strategyHash: Hex;
  strategyBytes: Hex;
  rule: Rule;
  shippedPrincipal: string;
  aaveIndexAtShipA: string;
  aaveIndexAtShipB: string;
  depositBlock: string;
}) {
  const record: PositionRecord = {
    user: rec.user,
    strategyHash: rec.strategyHash,
    chainId: 8453,
    createdAt: Date.now(),
    rule: rec.rule,
    legA: USDC_LEG,
    legB: USDbC_LEG,
    strategyBytes: rec.strategyBytes,
    shippedPrincipalA: BigInt(rec.shippedPrincipal),
    shippedPrincipalB: BigInt(rec.shippedPrincipal),
    aaveIndexAtShipA: BigInt(rec.aaveIndexAtShipA),
    aaveIndexAtShipB: BigInt(rec.aaveIndexAtShipB),
    depositBlock: BigInt(rec.depositBlock),
    status: 'active',
  };
  await ruleStore.put(record);
  revalidatePath('/app');
  return toClient({ ok: true });
}

/** Task 11: list the user's positions with their live state + rule verdict. */
export async function getPositionsAction(user: Address) {
  const records = await ruleStore.list({ user });
  records.sort((a, b) => b.createdAt - a.createdAt);
  const rows = await Promise.all(
    records.map(async (record) => {
      try {
        const { pos, result } = await evaluateRecord(record);
        return { record, pos, result, error: null as string | null };
      } catch (e) {
        return { record, pos: null, result: null, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return toClient(rows);
}

/** Task 13-15: one position with its live state + rule verdict. */
export async function getPositionAction(user: Address, strategyHash: Hex) {
  const record = await ruleStore.get(user, strategyHash);
  if (!record) return toClient({ notFound: true as const });
  try {
    const { pos, result } = await evaluateRecord(record);
    return toClient({ record, pos, result });
  } catch (e) {
    return toClient({ record, pos: null, result: null, error: e instanceof Error ? e.message : String(e) });
  }
}

/** Task 17: update the rule on a position. */
export async function saveRuleAction(user: Address, strategyHash: Hex, rule: Rule) {
  await ruleStore.update(user, strategyHash, { rule, status: 'active' });
  revalidatePath(`/app/position/${strategyHash}`);
  return toClient({ ok: true });
}

/** Task 18: build the unwind tx plan for the client to sign. */
export async function prepareUnwindAction(user: Address, strategyHash: Hex, withdrawFromAave = true) {
  const rec = await ruleStore.get(user, strategyHash);
  if (!rec) throw new Error('position not found');
  const plan = await buildUnwind(publicClient, {
    user,
    strategyHash,
    legA: rec.legA,
    legB: rec.legB,
    withdrawFromAave,
  });
  return toClient(plan);
}

/** Task 18: mark unwound after the client's dock tx is mined. */
export async function markUnwoundAction(user: Address, strategyHash: Hex, txHashes: Hex[]) {
  await ruleStore.update(user, strategyHash, {
    status: 'unwound',
    unwoundAt: Date.now(),
    unwindTxHashes: txHashes,
  });
  revalidatePath('/app');
  revalidatePath(`/app/position/${strategyHash}`);
  return toClient({ ok: true });
}

/** Task 19: run the keeper once over all active positions. */
export async function runKeeperAction() {
  const deps: KeeperDeps = {
    client: publicClient,
    store: ruleStore,
    signerFor: keeperSignerFor,
    notify: consoleNotifier,
  };
  const results = await runKeeperOnce(deps);
  revalidatePath('/app');
  revalidatePath('/app/keeper');
  return toClient(results);
}

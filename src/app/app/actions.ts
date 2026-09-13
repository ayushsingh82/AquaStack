'use server';

import { revalidatePath } from 'next/cache';
import type { Address, Hex } from 'viem';
import { ruleStore } from '@/lib/server/store';
import { publicClient } from '@/lib/server/client';
import { keeperSignerFor, keeperSignerInfo } from '@/lib/server/keeper-signer';
import { appendKeeperRun, listKeeperRuns } from '@/lib/server/keeper-log';
import { evaluateRecord } from '@/lib/server/api';
import { dealErc20 } from '@/lib/server/faucet';
import { toClient } from '@/lib/serialize';
import { buildDeposit, type DepositInput } from '@/lib/aqua/deposit';
import {
  CHAIN_ID, USDC, USDbC, aUSDC, aUSDbC, AQUA, AQUA_SWAP_VM_ROUTER, AQUA_ABI, ERC20_ABI,
} from '@/lib/aqua/constants';
import { buildUnwind } from '@/lib/aqua/unwind';
import { runKeeperOnce, consoleNotifier, type KeeperDeps } from '@/lib/keeper';
import type { PositionRecord, Rule } from '@/lib/rules';
import { encodeFunctionData } from 'viem';

const USDC_LEG = { token: USDC, aToken: aUSDC, decimals: 6 };
const USDbC_LEG = { token: USDbC, aToken: aUSDbC, decimals: 6 };

/** Faucet: mint test USDC + leg-B to the user (fork RPC only — anvil / Tenderly). */
export async function getTestTokensAction(user: Address) {
  const amount = 10_000n * 10n ** 6n;
  await dealErc20(USDC, user, amount);
  await dealErc20(USDbC, user, amount);
  return toClient({ ok: true, usdc: amount, legB: amount });
}

/** Task 9: build the ordered deposit tx plan for the client to sign. */
export async function prepareDepositAction(input: {
  user: Address;
  usdcAmount: string; // base units
  usdbcAmount?: string; // leg B — defaults to usdcAmount
  pegBand?: DepositInput['pegBand'];
  rule: Rule;
}) {
  const plan = buildDeposit({
    user: input.user,
    usdcAmount: BigInt(input.usdcAmount),
    usdbcAmount: input.usdbcAmount ? BigInt(input.usdbcAmount) : undefined,
    pegBand: input.pegBand,
  });

  // Aqua approvals are one-time (MAX_UINT256) — skip them on repeat deposits
  // once a prior deposit already left the allowance maxed out.
  const ALREADY_APPROVED = 2n ** 200n; // any allowance this large only ever came from our own max-approve
  const [aUsdcAllowance, aUsdbcAllowance] = await Promise.all([
    publicClient.readContract({ address: aUSDC, abi: ERC20_ABI, functionName: 'allowance', args: [input.user, AQUA] }),
    publicClient.readContract({ address: aUSDbC, abi: ERC20_ABI, functionName: 'allowance', args: [input.user, AQUA] }),
  ]);
  const steps = plan.steps.filter((s) => {
    if (s.to === aUSDC) return aUsdcAllowance < ALREADY_APPROVED;
    if (s.to === aUSDbC) return aUsdbcAllowance < ALREADY_APPROVED;
    return true;
  });
  const shipStepIndex = steps.findIndex((s) => s.label === 'Ship strategy to Aqua');

  return toClient({
    strategyHash: plan.strategyHash,
    strategyBytes: plan.strategy.strategyBytes,
    salt: plan.strategy.salt,
    pegBand: plan.strategy.pegBand,
    planned: plan.planned,
    steps,
    shipStepIndex,
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
    chainId: CHAIN_ID,
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

/** Task 22: record that the user delegated `walletAddress` (their Privy embedded
 *  wallet) to the keeper for this position. Undelegate by passing null. */
export async function delegateKeeperAction(user: Address, strategyHash: Hex, walletAddress: Address | null) {
  await ruleStore.update(user, strategyHash, { sessionSignerRef: walletAddress ?? undefined });
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

/** Task 20: keeper verdict table — dry-run evaluate every watched position (all users), no writes. */
export async function getKeeperVerdictsAction() {
  const [active, alerting] = await Promise.all([
    ruleStore.list({ status: 'active' }),
    ruleStore.list({ status: 'alerting' }),
  ]);
  const records = [...active, ...alerting].sort((a, b) => b.createdAt - a.createdAt);
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

/** Task 19: run the keeper once over all active positions. */
export async function runKeeperAction() {
  const deps: KeeperDeps = {
    client: publicClient,
    store: ruleStore,
    signerFor: keeperSignerFor,
    notify: consoleNotifier,
  };
  const results = await runKeeperOnce(deps);
  await appendKeeperRun(results);
  revalidatePath('/app');
  revalidatePath('/app/keeper');
  return toClient(results);
}

/** Task 21: recent keeper runs (newest first) for the activity log. */
export async function getKeeperLogAction() {
  return toClient(await listKeeperRuns());
}

/** Task 22: what the keeper can sign with (local demo key, or nothing → alert-only). */
export async function getKeeperStatusAction() {
  return toClient(keeperSignerInfo());
}

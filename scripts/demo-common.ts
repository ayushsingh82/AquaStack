/**
 * Shared helpers for the demo scripts (tasks 24-25).
 *
 * These run against a Base fork and write to the SAME JSON store the app +
 * keeper read (`.data/positions.json`), so a position opened here shows up on
 * the dashboard immediately. Do NOT import anything from `src/lib/server/*`
 * here — those modules are `server-only` and throw outside an RSC render.
 */
import { encodeFunctionData, type Address, type Hex } from 'viem';
import { Address as SdkAddress } from '@1inch/sdk-core';
import { SwapVMContract, TakerTraits, type Order } from '@1inch/swap-vm-sdk';
import { buildDeposit } from '../src/lib/aqua/deposit';
import {
  USDC, USDbC, aUSDC, aUSDbC, AAVE_POOL, AQUA_SWAP_VM_ROUTER,
  ERC20_ABI, AAVE_POOL_ABI, MAX_UINT256,
} from '../src/lib/aqua/constants';
import { JsonFileRuleStore, type PositionRecord, type Rule } from '../src/lib/rules';
import { pub, accounts, sendStep, deal, bal, u6, log } from './forkutil';

export const STORE_PATH = process.env.RULE_STORE_PATH || '.data/positions.json';
export const store = new JsonFileRuleStore(STORE_PATH);

export const LEG_A = { token: USDC, aToken: aUSDC, decimals: 6 };
export const LEG_B = { token: USDbC, aToken: aUSDbC, decimals: 6 };

export const aaveIndex = (asset: Address) =>
  pub.readContract({ address: AAVE_POOL, abi: AAVE_POOL_ABI, functionName: 'getReserveNormalizedIncome', args: [asset] }) as Promise<bigint>;

export const anvil = (method: string, params: unknown[]) =>
  pub.request({ method: method as never, params: params as never });

export async function warpDays(days: number) {
  await anvil('evm_increaseTime', [Math.round(days * 86_400)]);
  await anvil('evm_mine', []);
  log.info(`warped +${days} day${days === 1 ? '' : 's'}`);
}

/**
 * Full deposit → ship → persist. Returns the stored record and the SDK Order
 * (needed for taker swaps / quotes).
 */
export async function openPosition(opts: {
  walletIdx?: number;
  usdc: bigint;
  pegBand?: 'tight' | 'balanced' | 'wide';
  rule: Rule;
}): Promise<{ record: PositionRecord; order: Order; shipped: bigint }> {
  const walletIdx = opts.walletIdx ?? 0;
  const user = accounts[walletIdx].address;
  const depositBlock = await pub.getBlockNumber();

  await deal(USDC, user, opts.usdc);
  const plan = buildDeposit({ user, usdcAmount: opts.usdc, pegBand: opts.pegBand ?? 'wide' });
  for (let i = 0; i < plan.shipStepIndex; i++) {
    await sendStep(walletIdx, plan.steps[i].to, plan.steps[i].data, plan.steps[i].label);
  }
  const realA = await bal(aUSDC, user);
  const realB = await bal(aUSDbC, user);
  const idxA = await aaveIndex(USDC);
  const idxB = await aaveIndex(USDbC);
  const { step: shipStep, shipped } = plan.balancedShipStep(realA, realB);
  await sendStep(walletIdx, shipStep.to, shipStep.data, 'ship');

  const record: PositionRecord = {
    user, strategyHash: plan.strategyHash, chainId: 8453, createdAt: Date.now(),
    rule: opts.rule, legA: LEG_A, legB: LEG_B, strategyBytes: plan.strategy.strategyBytes,
    shippedPrincipalA: shipped, shippedPrincipalB: shipped,
    aaveIndexAtShipA: idxA, aaveIndexAtShipB: idxB,
    depositBlock, status: 'active',
  };
  await store.put(record);
  log.ok(`position ${plan.strategyHash.slice(0, 10)}… — shipped ${u6(shipped)}/leg, rule ${JSON.stringify(opts.rule)}`);
  return { record, order: plan.strategy.order, shipped };
}

/** Give `walletIdx` an aToken balance (deal underlying → supply to Aave) and approve the router. */
export async function fundTaker(walletIdx: number, underlying: Address, amount: bigint) {
  const taker = accounts[walletIdx].address;
  const aToken = underlying.toLowerCase() === USDC.toLowerCase() ? aUSDC : aUSDbC;
  await deal(underlying, taker, amount);
  await sendStep(walletIdx, underlying, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [AAVE_POOL, MAX_UINT256] }));
  await sendStep(walletIdx, AAVE_POOL, encodeFunctionData({ abi: AAVE_POOL_ABI, functionName: 'supply', args: [underlying, amount, taker, 0] }));
  await sendStep(walletIdx, aToken, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [AQUA_SWAP_VM_ROUTER, MAX_UINT256] }));
}

/** One taker swap against a strategy: `amount` of `tokenIn` → `tokenOut`. */
export async function takerSwap(walletIdx: number, order: Order, tokenIn: Address, tokenOut: Address, amount: bigint) {
  const data = SwapVMContract.encodeSwapCallData({
    order,
    tokenIn: new SdkAddress(tokenIn),
    tokenOut: new SdkAddress(tokenOut),
    amount,
    takerTraits: TakerTraits.default(),
  }).toString() as Hex;
  await sendStep(walletIdx, AQUA_SWAP_VM_ROUTER, data, `taker swap ${u6(amount)}`);
}

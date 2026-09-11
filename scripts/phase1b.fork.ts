/**
 * Phase 1 fork-test — modules 3 & 4 (position.ts, unwind.ts)
 *
 *  1. deposit (module 1/2) and capture the ship-time Aave indices
 *  2. readPosition() on a fresh position          → active, no yield, no swaps
 *  3. a taker runs 2 swaps against the strategy    → Pulled/Pushed events + fees
 *  4. warp +30d                                    → Aave yield accrues
 *  5. readPosition() again                         → aaveYield > 0, swaps counted
 *  6. buildUnwind({ withdrawFromAave: true }) + execute → docked, USDC back
 *  7. readPosition()                               → docked
 *  8. buildUnwind() again                          → alreadyDocked, no dock step
 *
 *   npm run phase1b:fork
 */
import { encodeFunctionData } from 'viem';
import { Address as SdkAddress } from '@1inch/sdk-core';
import { SwapVMContract, TakerTraits } from '@1inch/swap-vm-sdk';
import { buildDeposit } from '../src/lib/aqua/deposit';
import { readPosition } from '../src/lib/aqua/position';
import { buildUnwind } from '../src/lib/aqua/unwind';
import {
  USDC, USDbC, aUSDC, aUSDbC, AAVE_POOL, AQUA_SWAP_VM_ROUTER,
  ERC20_ABI, AAVE_POOL_ABI, MAX_UINT256,
} from '../src/lib/aqua/constants';
import { pub, accounts, sendStep, deal, bal, anvil, u6, log } from './forkutil';

const legs = { legA: { token: USDC, aToken: aUSDC, decimals: 6 }, legB: { token: USDbC, aToken: aUSDbC, decimals: 6 } };

async function aaveIndex(asset: `0x${string}`) {
  return pub.readContract({ address: AAVE_POOL, abi: AAVE_POOL_ABI, functionName: 'getReserveNormalizedIncome', args: [asset] }) as Promise<bigint>;
}

async function takerSwap(amountAUsdbc: bigint, order: import('@1inch/swap-vm-sdk').Order) {
  const data = SwapVMContract.encodeSwapCallData({
    order, tokenIn: new SdkAddress(aUSDbC), tokenOut: new SdkAddress(aUSDC),
    amount: amountAUsdbc, takerTraits: TakerTraits.default(),
  }).toString() as `0x${string}`;
  await sendStep(1, AQUA_SWAP_VM_ROUTER, data, 'taker swap');
}

async function main() {
  const user = accounts[0].address;
  const taker = accounts[1].address;
  log.h('=== AquaStack Phase 1 fork-test — position.ts + unwind.ts ===');
  log.info(`block ${await pub.getBlockNumber()}  user ${user}`);

  // ---- 1. deposit ----
  const startBlock = await pub.getBlockNumber(); // scan events from here (fork block+); avoids upstream getLogs range limits
  const deposit = 1_000n * 10n ** 6n;
  await deal(USDC, user, deposit);
  // 'wide' band so the taker swaps below have comfortable room on a small demo pool
  const plan = buildDeposit({ user, usdcAmount: deposit, pegBand: 'wide', makerFeeBps: 0 });
  for (let i = 0; i < plan.shipStepIndex; i++) await sendStep(0, plan.steps[i].to, plan.steps[i].data, plan.steps[i].label);
  const realA = await bal(aUSDC, user);
  const realB = await bal(aUSDbC, user);
  const idxShipA = await aaveIndex(USDC);
  const idxShipB = await aaveIndex(USDbC);
  const { step: shipStep, shipped } = plan.balancedShipStep(realA, realB);
  await sendStep(0, shipStep.to, shipStep.data, 'ship');
  log.ok(`deposited 1,000 USDC → shipped ${u6(shipped)}/leg (hash ${plan.strategyHash.slice(0, 10)}…)`);

  const readInput = {
    maker: user, strategyHash: plan.strategyHash, order: plan.strategy.order,
    legA: legs.legA, legB: legs.legB,
    shippedPrincipalA: shipped, shippedPrincipalB: shipped,
    aaveIndexAtShipA: idxShipA, aaveIndexAtShipB: idxShipB,
    eventsFromBlock: startBlock,
  };

  // ---- 2. read fresh position ----
  log.h('[2] readPosition() — fresh');
  let pos = await readPosition(pub, readInput);
  log.check(pos.status === 'active', `status = ${pos.status}`);
  log.check(pos.legA.virtualBalance === shipped && pos.legB.virtualBalance === shipped, `virtual balances = ${u6(pos.legA.virtualBalance)} / ${u6(pos.legB.virtualBalance)}`);
  log.check(pos.aaveYieldTotal <= 5n, `aaveYieldTotal = ${pos.aaveYieldTotal} (≈nothing accrued yet; ≤ index rounding)`);
  log.check(pos.pegDeviationBps <= 20, `pegDeviationBps = ${pos.pegDeviationBps}`);
  log.check(pos.swaps.count === 0, `swaps.count = ${pos.swaps.count}`);

  // ---- 3. taker runs 2 swaps (small vs the ±0.5% band on a 495/leg pool) ----
  log.h('[3] taker runs 2 swaps against the strategy');
  await deal(USDbC, taker, 50n * 10n ** 6n);
  await sendStep(1, USDbC, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [AAVE_POOL, MAX_UINT256] }));
  await sendStep(1, AAVE_POOL, encodeFunctionData({ abi: AAVE_POOL_ABI, functionName: 'supply', args: [USDbC, 50n * 10n ** 6n, taker, 0] }));
  await sendStep(1, aUSDbC, encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [AQUA_SWAP_VM_ROUTER, MAX_UINT256] }));
  await takerSwap(3n * 10n ** 6n, plan.strategy.order);
  await takerSwap(3n * 10n ** 6n, plan.strategy.order);
  log.ok('2 × 3 aUSDbC → aUSDC swaps done');

  // ---- 4. warp for Aave yield ----
  await anvil('evm_increaseTime', [30 * 86_400]);
  await anvil('evm_mine', []);
  log.info('warped +30 days');

  // ---- 5. read position again ----
  log.h('[5] readPosition() — after swaps + 30d');
  pos = await readPosition(pub, readInput);
  log.check(pos.aaveYieldTotal > 0n, `aaveYieldTotal = ${u6(pos.aaveYieldTotal)} (Aave interest on both legs)`);
  log.check(pos.swaps.count === 2, `swaps.count = ${pos.swaps.count}`);
  log.check(pos.swaps.pulled > 0n, `swaps.pulled = ${u6(pos.swaps.pulled)} aUSDC out to takers`);
  log.info(`aquaPnl = ${pos.aquaPnl >= 0n ? '+' : ''}${u6(pos.aquaPnl)}  (virtual value vs shipped — fees minus inventory drift)`);
  log.info(`legA virtual ${u6(pos.legA.virtualBalance)}  legB virtual ${u6(pos.legB.virtualBalance)}  pegDev ${pos.pegDeviationBps}bps`);

  // ---- 6. unwind (dock + withdraw) ----
  log.h('[6] buildUnwind({ withdrawFromAave: true }) + execute');
  const unwind = await buildUnwind(pub, { user, strategyHash: plan.strategyHash, legA: legs.legA, legB: legs.legB, withdrawFromAave: true });
  log.check(!unwind.alreadyDocked && unwind.status === 'active', `plan: status ${unwind.status}, ${unwind.steps.length} steps`);
  const usdcBefore = await bal(USDC, user);
  for (const s of unwind.steps) { const g = await sendStep(0, s.to, s.data, s.label); log.ok(`${s.label} (gas ${g})`); }
  const usdcAfter = await bal(USDC, user);
  log.check(usdcAfter > usdcBefore, `USDC back to wallet: ${u6(usdcBefore)} → ${u6(usdcAfter)}  (+${u6(usdcAfter - usdcBefore)})`);

  // ---- 7. read docked position ----
  log.h('[7] readPosition() — after unwind');
  pos = await readPosition(pub, readInput);
  log.check(pos.status === 'docked', `status = ${pos.status}`);
  log.check(pos.aquaPnl === 0n, `aquaPnl zeroed for a docked position`);

  // ---- 8. idempotent second unwind ----
  log.h('[8] buildUnwind() again — keeper safety');
  const again = await buildUnwind(pub, { user, strategyHash: plan.strategyHash, legA: legs.legA, legB: legs.legB });
  log.check(again.alreadyDocked && again.dockStep === null && again.steps.length === 0, `alreadyDocked=${again.alreadyDocked}, no dock step, ${again.steps.length} steps`);

  log.h(process.exitCode ? '=== FAIL ===\n' : '=== Phase 1 modules 3 & 4: PASS ===\n');
}

main().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });

/**
 * End-to-end on a Base Sepolia fork (chain 84532), real Aave v3 + our deployed
 * Aqua stack:
 *
 *   deposit (USDC + USDT -> Aave -> ship)  ->  readPosition  ->  evaluate
 *     ->  a taker swap  ->  warp for Aave yield  ->  readPosition again
 *     ->  buildUnwind (dock + Aave withdraw)  ->  funds back
 *
 *   ./scripts/run-fork.sh e2e.sepolia   (after deploy-testnet.ts against the fork)
 */
import './_env';
import { readPosition } from '../src/lib/aqua/position';
import { buildUnwind } from '../src/lib/aqua/unwind';
import { evaluate } from '../src/lib/rules';
import { RULE_PRESETS } from '../src/lib/rules';
import { USDC, USDbC, aUSDC, aUSDbC } from '../src/lib/aqua/constants';
import { pub, accounts, sendStep, bal, u6, log } from './forkutil';
import { openPosition, fundTaker, takerSwap, warpDays, LEG_A, LEG_B, aaveIndex } from './demo-common';

async function main() {
  const user = accounts[0].address;
  log.h(`=== e2e — chain ${await pub.getChainId()} @ block ${await pub.getBlockNumber()} ===`);
  log.info(`Aqua ${process.env.NEXT_PUBLIC_AQUA}  Router ${process.env.NEXT_PUBLIC_AQUA_SWAP_VM_ROUTER}`);

  // 1. deposit
  const { record, order } = await openPosition({
    walletIdx: 0,
    usdc: 5_000n * 10n ** 6n,
    pegBand: 'wide',
    rule: { ...RULE_PRESETS.balanced },
  });

  const readInput = {
    maker: user, strategyHash: record.strategyHash, order,
    legA: LEG_A, legB: LEG_B,
    shippedPrincipalA: record.shippedPrincipalA, shippedPrincipalB: record.shippedPrincipalB,
    aaveIndexAtShipA: record.aaveIndexAtShipA, aaveIndexAtShipB: record.aaveIndexAtShipB,
    eventsFromBlock: record.depositBlock,
  };

  // 2. read fresh
  log.h('[2] readPosition() — fresh');
  let pos = await readPosition(pub, readInput);
  log.check(pos.status === 'active', `status ${pos.status}`);
  log.check(pos.pegDeviationBps <= 30, `peg deviation ${pos.pegDeviationBps}bps`);
  log.check(pos.swaps.count === 0, `swaps ${pos.swaps.count}`);

  // 3. taker swaps + Aave yield
  log.h('[3] a taker swaps, then warp 30d');
  await fundTaker(1, USDbC, 200n * 10n ** 6n);
  await takerSwap(1, order, aUSDbC, aUSDC, 5n * 10n ** 6n);
  await takerSwap(1, order, aUSDbC, aUSDC, 5n * 10n ** 6n);
  await warpDays(30);

  log.h('[4] readPosition() — after');
  pos = await readPosition(pub, readInput);
  log.check(pos.swaps.count === 2, `swaps ${pos.swaps.count}`);
  log.info(`Aave yield ${u6(pos.aaveYieldTotal)} · Aqua PnL ${pos.aquaPnl >= 0n ? '+' : ''}${u6(pos.aquaPnl)}`);
  const verdict = evaluate(pos, record.rule);
  log.info(`rule verdict: ${verdict.action} (return ${verdict.metrics.totalReturnBps.toFixed(1)}bps)`);

  // 5. unwind
  log.h('[5] buildUnwind() + execute');
  const plan = await buildUnwind(pub, {
    user, strategyHash: record.strategyHash, legA: LEG_A, legB: LEG_B, withdrawFromAave: true,
  });
  log.check(!plan.alreadyDocked && plan.steps.length >= 1, `plan: ${plan.steps.length} steps, status ${plan.status}`);
  const usdcBefore = await bal(USDC, user);
  for (const s of plan.steps) await sendStep(0, s.to, s.data, s.label);
  const usdcAfter = await bal(USDC, user);
  log.check(usdcAfter > usdcBefore, `USDC back: ${u6(usdcBefore)} → ${u6(usdcAfter)} (+${u6(usdcAfter - usdcBefore)})`);

  log.h('[6] readPosition() — docked');
  pos = await readPosition(pub, readInput);
  log.check(pos.status === 'docked', `status ${pos.status}`);

  void aaveIndex;
  log.h(process.exitCode ? '=== e2e FAILED ===\n' : '=== e2e PASSED ===\n');
}

main().catch((e) => { console.error('\nFATAL:', e); process.exit(1); });

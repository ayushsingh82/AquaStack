/**
 * Task 24 — demo seed script.
 *
 * Opens a position (written to `.data/positions.json`, so it appears on the
 * running app's dashboard) and then has a counterparty run back-and-forth
 * swaps against it with time warps between rounds, so the detail page shows
 * a non-zero swap count, real fee PnL and accruing Aave yield.
 *
 *   ./scripts/run-fork.sh seed.fork
 *
 * Then start the app against the same fork (`npm run dev`) and open /app.
 */
import { readPosition } from '../src/lib/aqua/position';
import { RULE_PRESETS } from '../src/lib/rules';
import { USDC, USDbC, aUSDC, aUSDbC } from '../src/lib/aqua/constants';
import { pub, u6, log } from './forkutil';
import { openPosition, fundTaker, takerSwap, warpDays, store } from './demo-common';

const ROUNDS = 4;
const SWAP = 2n * 10n ** 6n; // 2 aTokens per leg of a round

async function main() {
  log.h('=== AquaLadder demo seed ===');
  log.info(`RPC block ${await pub.getBlockNumber()} · store ${store ? 'ready' : '?'}`);

  // 1. open a position with a balanced rule (won't auto-unwind on small wobble)
  const { record, order } = await openPosition({
    walletIdx: 0,
    usdc: 400n * 10n ** 6n,
    pegBand: 'wide',
    rule: { ...RULE_PRESETS.balanced },
  });

  // 2. fund the counterparty on both legs
  log.h('funding counterparty (wallet 1)');
  await fundTaker(1, USDbC, 40n * 10n ** 6n);
  await fundTaker(1, USDC, 40n * 10n ** 6n);

  // 3. back-and-forth swaps + time warps
  for (let r = 1; r <= ROUNDS; r++) {
    log.h(`round ${r}/${ROUNDS}`);
    await takerSwap(1, order, aUSDbC, aUSDC, SWAP);
    await takerSwap(1, order, aUSDC, aUSDbC, SWAP);
    await warpDays(2);
  }

  // 4. read the position back the way the app does
  const pos = await readPosition(pub, {
    maker: record.user,
    strategyHash: record.strategyHash,
    order,
    legA: { token: USDC, aToken: aUSDC, decimals: 6 },
    legB: { token: USDbC, aToken: aUSDbC, decimals: 6 },
    shippedPrincipalA: record.shippedPrincipalA,
    shippedPrincipalB: record.shippedPrincipalB,
    aaveIndexAtShipA: record.aaveIndexAtShipA,
    aaveIndexAtShipB: record.aaveIndexAtShipB,
    eventsFromBlock: record.depositBlock,
  });

  log.h('=== seeded ===');
  log.ok(`position ${record.strategyHash}`);
  log.info(`swaps ${pos.swaps.count} · pulled ${u6(pos.swaps.pulled)} · pushed ${u6(pos.swaps.pushed)}`);
  log.info(`Aave yield ${u6(pos.aaveYieldTotal)} · Aqua PnL ${pos.aquaPnl >= 0n ? '+' : ''}${u6(pos.aquaPnl)} · peg dev ${pos.pegDeviationBps}bps`);
  log.info('start the app on this fork (npm run dev) and open /app to see it live');
}

main().catch((e) => {
  console.error('\nFATAL:', e);
  process.exit(1);
});

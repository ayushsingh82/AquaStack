/**
 * Task 25 — depeg demo script.
 *
 * Opens a position with a TIGHT peg-deviation rule (auto-unwind on), then has a
 * whale run one large one-directional swap against the pegged pool. That pushes
 * the pool's own quote well off 1:1 — exactly the signal the rule watches
 * (`PositionState.pegDeviationBps`, straight from the live quote probe).
 *
 * The script prints the before/after deviation and the rule verdict. Then the
 * presenter clicks "Run keeper now" in /app/keeper and watches it dock().
 * Pass `--run-keeper` to also fire the keeper headless from here.
 *
 *   ./scripts/run-fork.sh depeg.fork
 *   ./scripts/run-fork.sh depeg.fork -- --run-keeper
 */
import './_env'; // MUST be first — sets NEXT_PUBLIC_CHAIN_ID before constants.ts loads
import { readPosition } from '../src/lib/aqua/position';
import { evaluate } from '../src/lib/rules';
import { runKeeperOnce, LocalKeySigner, consoleNotifier } from '../src/lib/keeper';
import { USDbC, aUSDC, aUSDbC } from '../src/lib/aqua/constants';
import { pub, accounts, u6, log, RPC } from './forkutil';
import { openPosition, fundTaker, takerSwap, store, LEG_A, LEG_B } from './demo-common';

const TIGHT_RULE = { pegDeviationBps: 25, stopLossBps: 500, autoUnwind: true };
const POOL = 200n * 10n ** 6n; // small pool so a whale can visibly move the peg
const WHALE_STEP = 60n * 10n ** 6n; // per one-directional whale swap

async function main() {
  const runKeeper = process.argv.includes('--run-keeper');
  log.h('=== AquaStack depeg demo ===');
  log.info(`RPC block ${await pub.getBlockNumber()}`);

  const { record, order } = await openPosition({
    walletIdx: 0,
    usdc: POOL,
    pegBand: 'tight',
    rule: TIGHT_RULE,
  });

  const readInput = {
    maker: record.user,
    strategyHash: record.strategyHash,
    order,
    legA: LEG_A,
    legB: LEG_B,
    shippedPrincipalA: record.shippedPrincipalA,
    shippedPrincipalB: record.shippedPrincipalB,
    aaveIndexAtShipA: record.aaveIndexAtShipA,
    aaveIndexAtShipB: record.aaveIndexAtShipB,
    eventsFromBlock: record.depositBlock,
  };

  let pos = await readPosition(pub, readInput);
  log.info(`before: peg deviation ${pos.pegDeviationBps}bps (rule limit ${TIGHT_RULE.pegDeviationBps}bps)`);

  log.h('whale dumps aUSDbC into the pool (one-directional, until the rule trips)');
  await fundTaker(1, USDbC, 600n * 10n ** 6n);
  for (let i = 1; i <= 8; i++) {
    await takerSwap(1, order, aUSDbC, aUSDC, WHALE_STEP);
    pos = await readPosition(pub, readInput);
    log.info(`  swap ${i}: peg deviation ${pos.pegDeviationBps}bps`);
    if (pos.pegDeviationBps >= TIGHT_RULE.pegDeviationBps) break;
  }

  const verdict = evaluate(pos, record.rule);
  log.h('=== after the swap ===');
  log.info(`peg deviation ${pos.pegDeviationBps}bps · quote a→b ${pos.quote.aToB.toFixed(5)} · b→a ${pos.quote.bToA.toFixed(5)}`);
  log.info(`Aqua PnL ${pos.aquaPnl >= 0n ? '+' : ''}${u6(pos.aquaPnl)} (whale walked the curve toward aUSDbC)`);
  log.check(
    verdict.triggered && verdict.action === 'unwind',
    `rule verdict: ${verdict.action} — ${verdict.reasons.map((r) => r.kind).join(', ') || 'none'}`,
  );

  if (runKeeper) {
    log.h('running the keeper (--run-keeper)');
    const signer = new LocalKeySigner(accounts[0], RPC, pub);
    const results = await runKeeperOnce({
      client: pub,
      store,
      signerFor: () => signer,
      notify: consoleNotifier,
    });
    for (const r of results) {
      log.info(`${r.strategyHash.slice(0, 10)}… ${r.action} — ${r.detail}${r.txHashes ? ` (${r.txHashes.length} txs)` : ''}`);
    }
    const after = await store.get(record.user, record.strategyHash);
    log.check(after?.status === 'unwound', `store status = ${after?.status}`);
  } else {
    log.info('now open /app/keeper and click "Run keeper now" to watch it dock() this position');
  }

  log.h(process.exitCode ? '=== FAIL ===\n' : '=== depeg demo ready ===\n');
}

main().catch((e) => {
  console.error('\nFATAL:', e);
  process.exit(1);
});

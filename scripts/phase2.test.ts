/**
 * Phase 2 unit test — rule model + evaluator + store.
 * Pure: no fork, no anvil.  `npm run phase2:test`
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PositionState, LegState } from '../src/lib/aqua/position';
import { evaluate, describeReasons, RULE_PRESETS, MemoryRuleStore, JsonFileRuleStore } from '../src/lib/rules';
import type { PositionRecord, Rule } from '../src/lib/rules';

let failed = 0;
function ok(c: boolean, m: string): void {
  console.log(`  ${c ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${m}`);
  if (!c) failed++;
}
const h = (s: string) => console.log('\n' + s);

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDbC = '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA';
const HASH = '0xabc0000000000000000000000000000000000000000000000000000000000001';

function leg(shipped: bigint): LegState {
  return {
    token: USDC, aToken: USDC, decimals: 6,
    virtualBalance: shipped, walletBalance: shipped, shippedPrincipal: shipped,
    aaveIndexAtShip: 10n ** 27n, aaveIndexNow: 10n ** 27n, aaveYield: 0n,
  };
}

/** PositionState factory — principal 1000 USDC (500/leg) unless overridden */
function pos(over: Partial<PositionState> & { aaveYieldTotal?: bigint; aquaPnl?: bigint; pegDeviationBps?: number } = {}): PositionState {
  const p = 500n * 10n ** 6n;
  return {
    strategyHash: HASH,
    status: over.status ?? 'active',
    legA: over.legA ?? leg(p),
    legB: over.legB ?? leg(p),
    aaveYieldTotal: over.aaveYieldTotal ?? 0n,
    aquaPnl: over.aquaPnl ?? 0n,
    quote: over.quote ?? { probeAmount: 10n ** 6n, aToB: 1, bToA: 1 },
    pegDeviationBps: over.pegDeviationBps ?? 0,
    swaps: over.swaps ?? { pulled: 0n, pushed: 0n, count: 0 },
    activity: over.activity ?? [],
  };
}

async function main() {
  // ---------------- evaluate() ----------------
  h('[evaluate] hold when nothing is hit');
  {
    const r = evaluate(pos({ aaveYieldTotal: 2_000000n }), RULE_PRESETS.balanced);
    ok(!r.triggered && r.action === 'hold', `action=${r.action}, return≈${r.metrics.totalReturnBps.toFixed(1)}bps`);
  }

  h('[evaluate] depeg → unwind (autoUnwind)');
  {
    const rule: Rule = { pegDeviationBps: 50, autoUnwind: true };
    const r = evaluate(pos({ pegDeviationBps: 80 }), rule);
    ok(r.triggered && r.action === 'unwind' && r.reasons[0].kind === 'depeg', `${describeReasons(r.reasons)} → ${r.action}`);
  }

  h('[evaluate] depeg with autoUnwind:false → alert only');
  {
    const r = evaluate(pos({ pegDeviationBps: 80 }), { pegDeviationBps: 50, autoUnwind: false });
    ok(r.triggered && r.action === 'alert', `action=${r.action}`);
  }

  h('[evaluate] take-profit');
  {
    // +30 USDC on 1000 principal = +300bps
    const r = evaluate(pos({ aaveYieldTotal: 20_000000n, aquaPnl: 10_000000n }), { takeProfitBps: 250, autoUnwind: true });
    ok(r.triggered && r.reasons.some((x) => x.kind === 'take-profit') && r.action === 'unwind', `return ${r.metrics.totalReturnBps.toFixed(0)}bps → ${describeReasons(r.reasons)}`);
  }

  h('[evaluate] stop-loss on a negative return');
  {
    // −8 USDC on 1000 = −80bps
    const r = evaluate(pos({ aquaPnl: -8_000000n }), { stopLossBps: 50, autoUnwind: true });
    ok(r.triggered && r.reasons.some((x) => x.kind === 'stop-loss'), `return ${r.metrics.totalReturnBps.toFixed(0)}bps → ${describeReasons(r.reasons)}`);
  }

  h('[evaluate] max-drawdown needs peak memory across calls');
  {
    const rule: Rule = { maxDrawdownBps: 40, autoUnwind: true };
    const up = evaluate(pos({ aaveYieldTotal: 10_000000n }), rule);          // +100bps, new peak
    ok(!up.triggered, `t1 +100bps peak, not triggered`);
    const down = evaluate(pos({ aaveYieldTotal: 5_000000n }), rule, up.nextContext); // +50bps → drawdown 50
    ok(down.triggered && down.reasons[0].kind === 'max-drawdown', `t2 drawdown ${down.metrics.drawdownBps.toFixed(0)}bps → ${down.action}`);
    const noCtx = evaluate(pos({ aaveYieldTotal: 5_000000n }), rule);        // same numbers, no memory
    ok(!noCtx.triggered, `t2 without context → not triggered (peak resets)`);
  }

  h('[evaluate] docked position never triggers');
  {
    const r = evaluate(pos({ status: 'docked', pegDeviationBps: 999 }), { pegDeviationBps: 10, autoUnwind: true });
    ok(!r.triggered && r.action === 'hold', `status=docked → ${r.action}`);
  }

  // ---------------- store ----------------
  const rec: PositionRecord = {
    user: '0xF39fD6E51aad88F6f4CE6Ab8827279cffFB92266',
    strategyHash: HASH,
    chainId: 8453,
    createdAt: Date.now(),
    rule: RULE_PRESETS.conservative,
    legA: { token: USDC, aToken: USDC, decimals: 6 },
    legB: { token: USDbC, aToken: USDbC, decimals: 6 },
    strategyBytes: '0xdeadbeef',
    shippedPrincipalA: 495_000001n,
    shippedPrincipalB: 495_000000n,
    aaveIndexAtShipA: 1_144_982_278_582_207_399_108_947_274n,
    aaveIndexAtShipB: 1_020_000_000_000_000_000_000_000_000n,
    depositBlock: 51_037_000n,
    status: 'active',
  };

  for (const [name, store] of [
    ['MemoryRuleStore', new MemoryRuleStore()],
    ['JsonFileRuleStore', new JsonFileRuleStore(join(tmpdir(), `aquastack-${randomUUID()}.json`))],
  ] as const) {
    h(`[store] ${name}`);
    await store.put(rec);
    const got = await store.get(rec.user, rec.strategyHash);
    ok(got !== null && got.shippedPrincipalA === 495_000001n && typeof got.aaveIndexAtShipA === 'bigint', 'get round-trips (bigints preserved)');
    const gotLower = await store.get(rec.user.toLowerCase() as typeof rec.user, rec.strategyHash.toUpperCase().replace('0X', '0x') as typeof rec.strategyHash);
    ok(gotLower !== null, 'key is case-insensitive on address + hash');
    const upd = await store.update(rec.user, rec.strategyHash, { status: 'unwound', peakReturnBps: 123 });
    ok(upd.status === 'unwound' && upd.peakReturnBps === 123, 'update patches fields');
    ok((await store.list({ status: 'active' })).length === 0 && (await store.list({ status: 'unwound' })).length === 1, 'list filters by status');
    await store.delete(rec.user, rec.strategyHash);
    ok((await store.get(rec.user, rec.strategyHash)) === null, 'delete removes it');
    let threw = false;
    try { await store.update(rec.user, rec.strategyHash, { status: 'active' }); } catch { threw = true; }
    ok(threw, 'update on a missing record throws');
  }

  h(failed ? `\x1b[31m=== ${failed} FAILED ===\x1b[0m\n` : '\x1b[32m=== Phase 2: PASS ===\x1b[0m\n');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

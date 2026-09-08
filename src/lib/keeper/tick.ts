/**
 * Phase 3, piece 2 + 3 — evaluate one position and act on it.
 *
 *   readPosition → evaluate → hold | alert | unwind
 *
 * Guards (piece 3):
 *   - the running max-drawdown peak is persisted on every tick, even on `hold`
 *   - `action: 'unwind'` with no signer attached → alert-only fallback
 *   - `buildUnwind` reports `alreadyDocked` → mark unwound, no txs (idempotent)
 *   - a failed unwind step → `unwind-failed` event, record stays actionable
 */
import { HexString } from '@1inch/sdk-core';
import { Order } from '@1inch/swap-vm-sdk';
import type { Hex } from 'viem';
import { readPosition } from '../aqua/position';
import { buildUnwind } from '../aqua/unwind';
import { evaluate, describeReasons } from '../rules';
import type { PositionRecord } from '../rules';
import type { KeeperDeps, TickResult } from './types';

export async function tickPosition(deps: KeeperDeps, record: PositionRecord): Promise<TickResult> {
  const base = { strategyHash: record.strategyHash, user: record.user };
  const order = Order.decode(new HexString(record.strategyBytes));

  const pos = await readPosition(deps.client, {
    maker: record.user,
    strategyHash: record.strategyHash,
    order,
    legA: record.legA,
    legB: record.legB,
    shippedPrincipalA: record.shippedPrincipalA,
    shippedPrincipalB: record.shippedPrincipalB,
    aaveIndexAtShipA: record.aaveIndexAtShipA,
    aaveIndexAtShipB: record.aaveIndexAtShipB,
    eventsFromBlock: record.depositBlock,
  });

  const result = evaluate(pos, record.rule, { peakReturnBps: record.peakReturnBps });
  const metrics = {
    totalReturnBps: result.metrics.totalReturnBps,
    pegDeviationBps: result.metrics.pegDeviationBps,
  };

  // guard: always persist the updated drawdown peak
  await deps.store.update(record.user, record.strategyHash, { peakReturnBps: result.nextContext.peakReturnBps });

  if (result.action === 'hold') {
    return { ...base, action: 'hold', detail: pos.status === 'active' ? 'within limits' : `status ${pos.status}`, ...metrics };
  }

  if (result.action === 'alert') {
    await deps.notify({ kind: 'alert', record, result });
    await deps.store.update(record.user, record.strategyHash, { status: 'alerting' });
    return { ...base, action: 'alert', detail: describeReasons(result.reasons), ...metrics };
  }

  // result.action === 'unwind'
  const signer = await deps.signerFor(record);
  if (!signer) {
    await deps.notify({ kind: 'unwind-needed-no-signer', record, result });
    await deps.store.update(record.user, record.strategyHash, { status: 'alerting' });
    return { ...base, action: 'alert', detail: `unwind needed, no signer: ${describeReasons(result.reasons)}`, ...metrics };
  }

  const plan = await buildUnwind(deps.client, {
    user: record.user,
    strategyHash: record.strategyHash,
    legA: record.legA,
    legB: record.legB,
    withdrawFromAave: true,
    withdrawTo: record.user,
  });

  if (plan.alreadyDocked) {
    await deps.store.update(record.user, record.strategyHash, { status: 'unwound', unwoundAt: Date.now() });
    return { ...base, action: 'noop', detail: 'already docked', ...metrics };
  }

  const txHashes: Hex[] = [];
  try {
    for (const step of plan.steps) txHashes.push(await signer.sendStep(step));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await deps.notify({ kind: 'unwind-failed', record, result, error, txHashes });
    return { ...base, action: 'error', detail: `unwind failed: ${error}`, txHashes, ...metrics };
  }

  await deps.store.update(record.user, record.strategyHash, {
    status: 'unwound', unwoundAt: Date.now(), unwindTxHashes: txHashes,
  });
  await deps.notify({ kind: 'unwound', record, result, txHashes });
  return { ...base, action: 'unwound', detail: describeReasons(result.reasons), txHashes, ...metrics };
}

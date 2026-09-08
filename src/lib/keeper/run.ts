/**
 * Phase 3, piece 1 — the cron entrypoint.
 *
 * One pass over every position that still needs watching: `active` (normal) and
 * `alerting` (already flagged, e.g. autoUnwind off, or a signer was missing last
 * tick — re-check in case it's now attached or the rule cleared). `unwound`
 * records are terminal and skipped.
 *
 * Wire `runKeeperOnce` to a Vercel Cron route or a small worker on an interval.
 */
import { tickPosition } from './tick';
import type { KeeperDeps, TickResult } from './types';

export async function runKeeperOnce(deps: KeeperDeps): Promise<TickResult[]> {
  const [active, alerting] = await Promise.all([
    deps.store.list({ status: 'active' }),
    deps.store.list({ status: 'alerting' }),
  ]);

  const results: TickResult[] = [];
  for (const record of [...active, ...alerting]) {
    try {
      results.push(await tickPosition(deps, record));
    } catch (e) {
      results.push({
        strategyHash: record.strategyHash,
        user: record.user,
        action: 'error',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

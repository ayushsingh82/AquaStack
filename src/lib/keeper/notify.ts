import type { KeeperEvent, Notifier } from './types';
import { describeReasons } from '../rules';

/** Default notifier — structured console output. Swap for Slack/webhook/push in prod. */
export const consoleNotifier: Notifier = (e: KeeperEvent) => {
  const tag = `[keeper] ${e.record.strategyHash.slice(0, 10)}…`;
  switch (e.kind) {
    case 'alert':
      console.log(`${tag} ALERT — ${describeReasons(e.result.reasons)} (autoUnwind off)`);
      break;
    case 'unwound':
      console.log(`${tag} UNWOUND — ${describeReasons(e.result.reasons)} — txs ${e.txHashes.join(', ')}`);
      break;
    case 'unwind-failed':
      console.log(`${tag} UNWIND FAILED — ${e.error} — partial txs ${e.txHashes.join(', ') || 'none'}`);
      break;
    case 'unwind-needed-no-signer':
      console.log(`${tag} NEEDS UNWIND but no session signer attached — ${describeReasons(e.result.reasons)}`);
      break;
  }
};

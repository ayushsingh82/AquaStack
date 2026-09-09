import type { Address, Hex, PublicClient } from 'viem';
import type { PositionRecord, RuleStore, EvalResult } from '../rules';
import type { TxStep } from '../aqua/types';

/**
 * Signs and broadcasts the keeper's unwind transactions on behalf of one user.
 *
 * In production this is backed by a Privy session signer scoped to `dock()` and
 * Aave `withdraw()` only; in tests it is a local key. `sendStep` must wait for
 * the receipt and throw if the tx reverts.
 */
export interface PositionSigner {
  address: Address;
  sendStep(step: TxStep): Promise<Hex>;
}

export type KeeperEvent =
  | { kind: 'alert'; record: PositionRecord; result: EvalResult }
  | { kind: 'unwound'; record: PositionRecord; result: EvalResult; txHashes: Hex[] }
  | { kind: 'unwind-failed'; record: PositionRecord; result: EvalResult; error: string; txHashes: Hex[] }
  | { kind: 'unwind-needed-no-signer'; record: PositionRecord; result: EvalResult };

export type Notifier = (event: KeeperEvent) => Promise<void> | void;

export interface KeeperDeps {
  client: PublicClient;
  store: RuleStore;
  /** returns a signer for the given position, or null if none is attached (→ alert-only) */
  signerFor: (record: PositionRecord) => PositionSigner | null | Promise<PositionSigner | null>;
  notify: Notifier;
}

export type TickAction = 'hold' | 'alert' | 'unwound' | 'noop' | 'error';

export interface TickResult {
  strategyHash: Hex;
  user: Address;
  action: TickAction;
  /** why: eval reasons joined, or an error / status string */
  detail: string;
  totalReturnBps?: number;
  pegDeviationBps?: number;
  txHashes?: Hex[];
}

/** one recorded keeper pass, for the console's run history (task 21) */
export interface KeeperRun {
  at: number;
  /** total positions ticked */
  ticked: number;
  results: TickResult[];
}

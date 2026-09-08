import type { Address, Hex } from 'viem';

/**
 * The protective rule attached to one AquaLadder position.
 * Every threshold is optional — set only the ones you want. All are checked
 * on each evaluation; the first one that fires triggers an exit.
 */
export interface Rule {
  /** exit if the pegged pool's price deviates more than this from 1:1 (bps). e.g. 50 = ±0.5% */
  pegDeviationBps?: number;
  /** exit once total return (Aave yield + Aqua PnL) reaches this, in bps of principal */
  takeProfitBps?: number;
  /** exit if total return drops to −this (positive magnitude), in bps of principal */
  stopLossBps?: number;
  /** exit if the drop from the best return seen so far exceeds this, in bps */
  maxDrawdownBps?: number;
  /** true = keeper unwinds automatically; false = keeper only alerts */
  autoUnwind: boolean;
}

export const RULE_PRESETS = {
  /** tight depeg guard, no profit target */
  conservative: { pegDeviationBps: 30, stopLossBps: 50, maxDrawdownBps: 40, autoUnwind: true } satisfies Rule,
  /** looser, lets the position run */
  balanced: { pegDeviationBps: 75, stopLossBps: 150, autoUnwind: true } satisfies Rule,
  /** monitoring only — never auto-exits */
  alertOnly: { pegDeviationBps: 50, autoUnwind: false } satisfies Rule,
} as const;
export type RulePreset = keyof typeof RULE_PRESETS;

/** carried between evaluations so max-drawdown has memory (evaluate() stays pure) */
export interface EvalContext {
  /** best totalReturnBps observed so far; undefined on the first evaluation */
  peakReturnBps?: number;
}

export type TriggerReason =
  | { kind: 'depeg'; pegDeviationBps: number; limitBps: number }
  | { kind: 'take-profit'; returnBps: number; targetBps: number }
  | { kind: 'stop-loss'; returnBps: number; limitBps: number }
  | { kind: 'max-drawdown'; drawdownBps: number; limitBps: number };

export interface EvalResult {
  triggered: boolean;
  /** every threshold that fired this evaluation */
  reasons: TriggerReason[];
  /** what the keeper should do */
  action: 'hold' | 'alert' | 'unwind';
  metrics: {
    principal: bigint;
    aaveYield: bigint;
    aquaPnl: bigint;
    totalReturnBps: number;
    pegDeviationBps: number;
    drawdownBps: number;
  };
  /** feed back into the next evaluate() call */
  nextContext: EvalContext;
}

/** everything the keeper needs to re-read and evaluate a position, persisted at deposit time */
export interface PositionRecord {
  user: Address;
  strategyHash: Hex;
  chainId: number;
  createdAt: number;
  rule: Rule;
  /** ship-time inputs for readPosition() */
  shippedPrincipalA: bigint;
  shippedPrincipalB: bigint;
  aaveIndexAtShipA: bigint;
  aaveIndexAtShipB: bigint;
  depositBlock: bigint;
  /** opaque handle to the Privy session signer authorised for dock()/withdraw */
  sessionSignerRef?: string;
  status: 'active' | 'alerting' | 'unwound';
  /** running peak for max-drawdown (mirrors EvalContext.peakReturnBps) */
  peakReturnBps?: number;
}

export interface RuleStore {
  get(user: Address, strategyHash: Hex): Promise<PositionRecord | null>;
  put(record: PositionRecord): Promise<void>;
  /** patch an existing record; throws if it doesn't exist */
  update(user: Address, strategyHash: Hex, patch: Partial<PositionRecord>): Promise<PositionRecord>;
  list(filter?: { status?: PositionRecord['status']; user?: Address }): Promise<PositionRecord[]>;
  delete(user: Address, strategyHash: Hex): Promise<void>;
}

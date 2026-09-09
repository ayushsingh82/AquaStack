import 'server-only';
import type { Address, Hex } from 'viem';
import { Order } from '@1inch/swap-vm-sdk';
import { HexString } from '@1inch/sdk-core';
import { publicClient } from './client';
import { ruleStore } from './store';
import { readPosition, type PositionState } from '../aqua/position';
import { evaluate, type EvalResult, type PositionRecord } from '../rules';

/** rebuild the readPosition() input from a stored record */
export function readInputFor(rec: PositionRecord) {
  return {
    maker: rec.user,
    strategyHash: rec.strategyHash,
    order: Order.decode(new HexString(rec.strategyBytes)),
    legA: rec.legA,
    legB: rec.legB,
    shippedPrincipalA: rec.shippedPrincipalA,
    shippedPrincipalB: rec.shippedPrincipalB,
    aaveIndexAtShipA: rec.aaveIndexAtShipA,
    aaveIndexAtShipB: rec.aaveIndexAtShipB,
    eventsFromBlock: rec.depositBlock,
  };
}

export function listPositions(user: Address): Promise<PositionRecord[]> {
  return ruleStore.list({ user });
}

export function getRecord(user: Address, hash: Hex): Promise<PositionRecord | null> {
  return ruleStore.get(user, hash);
}

export function readPositionState(rec: PositionRecord): Promise<PositionState> {
  return readPosition(publicClient, readInputFor(rec));
}

export async function evaluateRecord(
  rec: PositionRecord,
): Promise<{ pos: PositionState; result: EvalResult }> {
  const pos = await readPositionState(rec);
  const result = evaluate(pos, rec.rule, { peakReturnBps: rec.peakReturnBps });
  return { pos, result };
}

/**
 * Module 4 — build the transaction plan to unwind a position.
 *
 *   aqua.dock(strategy)                  — pure accounting, instant; frees the
 *                                          virtual balance. Aqua never held the
 *                                          aTokens, so there is nothing to return.
 *   [optional] Aave.withdraw(both legs)  — aUSDC/aUSDbC → USDC/USDbC to the user.
 *
 * Idempotent by design: reads the strategy status first. If it is already docked
 * (or was never shipped) the dock step is omitted and `alreadyDocked` is set, so
 * a keeper can call this blindly every tick. Phase 0 confirmed every stale path
 * (second dock, dock-never-shipped, swap-after-dock) reverts on-chain.
 */
import { encodeFunctionData, type Address, type Hex, type PublicClient } from 'viem';
import {
  AQUA, AQUA_SWAP_VM_ROUTER, AAVE_POOL, AAVE_DATA_PROVIDER, AQUA_ABI, AAVE_POOL_ABI,
  AAVE_DATA_PROVIDER_ABI, MAX_UINT256,
} from './constants';
import type { TxStep, TokenLeg } from './types';
import { statusFromTokensCount, type PositionStatus } from './position';

export interface UnwindInput {
  user: Address;
  strategyHash: Hex;
  legA: TokenLeg;
  legB: TokenLeg;
  /** also pull the freed aTokens out of Aave back to the underlying. Default false (keep earning Aave yield). */
  withdrawFromAave?: boolean;
  /** where withdrawn underlying goes. Default: `user`. */
  withdrawTo?: Address;
}

export interface UnwindPlan {
  /** ordered txs to sign; may be empty if there is nothing to do */
  steps: TxStep[];
  /** the dock tx on its own (or null if the strategy is not active) — handy for a keeper */
  dockStep: TxStep | null;
  /** true if the strategy was already docked / never shipped */
  alreadyDocked: boolean;
  status: PositionStatus;
}

const withdraw = (asset: Address, to: Address): Hex =>
  encodeFunctionData({ abi: AAVE_POOL_ABI, functionName: 'withdraw', args: [asset, MAX_UINT256, to] });

const repayWithATokens = (asset: Address): Hex =>
  encodeFunctionData({ abi: AAVE_POOL_ABI, functionName: 'repayWithATokens', args: [asset, MAX_UINT256, 2n] });

const dock = (strategyHash: Hex, aTokens: Address[]): Hex =>
  encodeFunctionData({ abi: AQUA_ABI, functionName: 'dock', args: [AQUA_SWAP_VM_ROUTER, strategyHash, aTokens] });

/** Aqua's pegged-swap settlement can leave the maker with a small variable debt
 *  in one leg (borrow-to-deliver when the aToken is locked as Aave collateral).
 *  Repaying it with the aToken keeps `withdraw(MAX)` from tripping the HF check. */
async function variableDebt(client: PublicClient, asset: Address, user: Address): Promise<bigint> {
  try {
    const res = (await client.readContract({
      address: AAVE_DATA_PROVIDER, abi: AAVE_DATA_PROVIDER_ABI,
      functionName: 'getUserReserveData', args: [asset, user],
    })) as unknown as readonly bigint[];
    return res[2] ?? 0n; // currentVariableDebt
  } catch {
    return 0n;
  }
}

export async function buildUnwind(client: PublicClient, input: UnwindInput): Promise<UnwindPlan> {
  const { user, strategyHash, legA, legB } = input;
  const to = input.withdrawTo ?? user;

  const [, tokensCount] = (await client.readContract({
    address: AQUA, abi: AQUA_ABI, functionName: 'rawBalances',
    args: [user, AQUA_SWAP_VM_ROUTER, strategyHash, legA.aToken],
  })) as [bigint, number];
  const status = statusFromTokensCount(tokensCount);

  const withdrawSteps: TxStep[] = [];
  if (input.withdrawFromAave) {
    for (const [name, leg] of [['leg A', legA], ['leg B', legB]] as const) {
      if ((await variableDebt(client, leg.token, user)) > 0n) {
        withdrawSteps.push({ label: `Repay ${name} debt (aToken)`, to: AAVE_POOL, data: repayWithATokens(leg.token) });
      }
      withdrawSteps.push({ label: `Withdraw ${name} from Aave`, to: AAVE_POOL, data: withdraw(leg.token, to) });
    }
  }

  if (status !== 'active') {
    return { steps: withdrawSteps, dockStep: null, alreadyDocked: true, status };
  }

  const dockStep: TxStep = {
    label: 'Dock strategy (Aqua)',
    to: AQUA,
    data: dock(strategyHash, [legA.aToken, legB.aToken]),
  };
  return { steps: [dockStep, ...withdrawSteps], dockStep, alreadyDocked: false, status };
}

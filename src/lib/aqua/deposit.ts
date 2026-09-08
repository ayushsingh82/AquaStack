/**
 * Module 1 — build the ordered transaction plan for a single-token deposit.
 *
 *   USDC in
 *     → swap ½ to USDbC (Uniswap v3)
 *     → supply both halves to Aave v3        (→ aUSDC + aUSDbC, rebasing)
 *     → approve both aTokens to Aqua
 *     → aqua.ship(pegged aUSDC/aUSDbC strategy)
 *
 * Returns the steps to sign in order. The final `ship` step uses *planned*
 * amounts (½ each); call `plan.shipStep(realAUsdc, realAUsdbc)` after the
 * supplies to ship the exact post-supply balances dust-free.
 *
 * Phase 0 verified every leg of this on a Base fork (workdone.md).
 */
import { encodeFunctionData, type Address, type Hex } from 'viem';
import {
  USDC, USDbC, aUSDC, aUSDbC, AAVE_POOL, AQUA, AQUA_SWAP_VM_ROUTER,
  AERODROME_ROUTER, AERODROME_FACTORY, MAX_UINT256,
  ERC20_ABI, AAVE_POOL_ABI, AERODROME_ROUTER_ABI, AQUA_ABI,
} from './constants';
import { buildPeggedStrategy, type BuiltStrategy, type PegBandPercent, type PegBandPreset } from './strategy';
import type { TxStep, TokenLeg } from './types';

const USDC_LEG: TokenLeg = { token: USDC, aToken: aUSDC, decimals: 6 };
const USDBC_LEG: TokenLeg = { token: USDbC, aToken: aUSDbC, decimals: 6 };

export interface DepositInput {
  user: Address;
  /** USDC the user deposits, in 6-decimal base units */
  usdcAmount: bigint;
  /** ±% peg band, or a preset ("tight" | "balanced" | "wide"). Default "balanced". */
  pegBand?: PegBandPercent | PegBandPreset;
  /** maker/LP fee (bps) on amountIn. Default 1 bp. */
  makerFeeBps?: number;
  /** strategy salt; defaults to random so re-deposits never collide */
  salt?: bigint;
  /** slippage tolerance (bps) for the USDC→USDbC half-swap. Default 100 (1%). */
  swapSlippageBps?: number;
  /** unix deadline for the Aerodrome swap. Default now + 20 min. */
  swapDeadline?: bigint;
}

export interface DepositPlan {
  strategy: BuiltStrategy;
  strategyHash: Hex;
  legs: { usdc: TokenLeg; usdbc: TokenLeg };
  /** amounts baked into `steps` (aToken units ≈ underlying, 6dp) */
  planned: { swapIn: bigint; supplyUsdc: bigint; minUsdbcOut: bigint; shipAUsdc: bigint; shipAUsdbc: bigint };
  /** ordered txs to sign; steps before `shipStepIndex` are exact */
  steps: TxStep[];
  shipStepIndex: number;
  /** rebuild ONLY the ship step with explicit per-leg amounts */
  shipStep(aUsdcAmount: bigint, aUsdbcAmount: bigint): TxStep;
  /**
   * Rebuild the ship step with a *balanced* pool: ships `min(realAUsdc, realAUsdbc)`
   * on both legs so the pegged curve starts at 1:1. The small remainder on the
   * heavier leg stays in the wallet — still an Aave-earning aToken, just not in
   * the Aqua position. Recommended over `shipStep` for a clean peg.
   */
  balancedShipStep(realAUsdc: bigint, realAUsdbc: bigint): { step: TxStep; shipped: bigint; remainder: { token: 'aUSDC' | 'aUSDbC'; amount: bigint } };
}

const approve = (token: Address, spender: Address, amount: bigint): Hex =>
  encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [spender, amount] });

const supply = (asset: Address, amount: bigint, onBehalfOf: Address): Hex =>
  encodeFunctionData({ abi: AAVE_POOL_ABI, functionName: 'supply', args: [asset, amount, onBehalfOf, 0] });

function swapExactIn(tokenIn: Address, tokenOut: Address, recipient: Address, amountIn: bigint, minOut: bigint, deadline: bigint): Hex {
  return encodeFunctionData({
    abi: AERODROME_ROUTER_ABI,
    functionName: 'swapExactTokensForTokens',
    args: [
      amountIn,
      minOut,
      [{ from: tokenIn, to: tokenOut, stable: true, factory: AERODROME_FACTORY }],
      recipient,
      deadline,
    ],
  });
}

function shipCalldata(strategy: BuiltStrategy, amountA: bigint, amountB: bigint): Hex {
  // ship token array order must match the strategy legs: aUSDC then aUSDbC
  return encodeFunctionData({
    abi: AQUA_ABI,
    functionName: 'ship',
    args: [AQUA_SWAP_VM_ROUTER, strategy.strategyBytes, [aUSDC, aUSDbC], [amountA, amountB]],
  });
}

export function buildDeposit(input: DepositInput): DepositPlan {
  const { user, usdcAmount } = input;
  if (usdcAmount <= 0n) throw new Error('usdcAmount must be positive');

  const slippageBps = BigInt(input.swapSlippageBps ?? 100);
  const deadline = input.swapDeadline ?? BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

  const swapIn = usdcAmount / 2n;
  const supplyUsdc = usdcAmount - swapIn; // keeps odd base units on the USDC leg
  const minUsdbcOut = (swapIn * (10_000n - slippageBps)) / 10_000n;

  // Plan a *balanced* pool: the pegged curve is symmetric (x0 == y0) so it starts
  // exactly at 1:1. `minUsdbcOut` is the conservative amount we're sure to have on
  // both legs after the swap; anything extra on the USDC leg stays in-wallet.
  const shipAUsdc = minUsdbcOut;
  const shipAUsdbc = minUsdbcOut;

  const strategy = buildPeggedStrategy(user, {
    aTokenA: aUSDC, decimalsA: 6,
    aTokenB: aUSDbC, decimalsB: 6,
    reserveA: shipAUsdc,
    reserveB: shipAUsdbc,
    pegBand: input.pegBand,
    makerFeeBps: input.makerFeeBps,
    salt: input.salt,
  });

  const steps: TxStep[] = [
    { label: 'Approve USDC for swap', to: USDC, data: approve(USDC, AERODROME_ROUTER, swapIn) },
    { label: 'Swap ½ USDC → USDbC', to: AERODROME_ROUTER, data: swapExactIn(USDC, USDbC, user, swapIn, minUsdbcOut, deadline) },
    { label: 'Approve USDC for Aave', to: USDC, data: approve(USDC, AAVE_POOL, supplyUsdc) },
    { label: 'Supply USDC to Aave', to: AAVE_POOL, data: supply(USDC, supplyUsdc, user) },
    { label: 'Approve USDbC for Aave', to: USDbC, data: approve(USDbC, AAVE_POOL, MAX_UINT256) },
    { label: 'Supply USDbC to Aave', to: AAVE_POOL, data: supply(USDbC, minUsdbcOut, user) },
    { label: 'Approve aUSDC for Aqua', to: aUSDC, data: approve(aUSDC, AQUA, MAX_UINT256) },
    { label: 'Approve aUSDbC for Aqua', to: aUSDbC, data: approve(aUSDbC, AQUA, MAX_UINT256) },
    { label: 'Ship strategy to Aqua', to: AQUA, data: shipCalldata(strategy, shipAUsdc, shipAUsdbc) },
  ];

  return {
    strategy,
    strategyHash: strategy.strategyHash,
    legs: { usdc: USDC_LEG, usdbc: USDBC_LEG },
    planned: { swapIn, supplyUsdc, minUsdbcOut, shipAUsdc, shipAUsdbc },
    steps,
    shipStepIndex: steps.length - 1,
    shipStep: (a: bigint, b: bigint): TxStep => ({
      label: 'Ship strategy to Aqua',
      to: AQUA,
      data: shipCalldata(strategy, a, b),
    }),
    balancedShipStep: (realAUsdc: bigint, realAUsdbc: bigint) => {
      const shipped = realAUsdc < realAUsdbc ? realAUsdc : realAUsdbc;
      const remainder = realAUsdc > realAUsdbc
        ? { token: 'aUSDC' as const, amount: realAUsdc - shipped }
        : { token: 'aUSDbC' as const, amount: realAUsdbc - shipped };
      return {
        step: { label: 'Ship strategy to Aqua', to: AQUA, data: shipCalldata(strategy, shipped, shipped) },
        shipped,
        remainder,
      };
    },
  };
}

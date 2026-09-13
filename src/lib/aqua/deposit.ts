/**
 * Module 1 — build the ordered transaction plan for a deposit.
 *
 *   USDC + USDbC in
 *     → supply both to Aave v3        (→ aUSDC + aUSDbC, rebasing)
 *     → approve both aTokens to Aqua
 *     → aqua.ship(pegged aUSDC/aUSDbC strategy)
 *
 * The user brings both legs (on Base Sepolia the pair is USDC + USDT; "USDbC"
 * here just means "leg B"). The pre-Sepolia Base-mainnet build swapped ½ USDC
 * to USDbC on Aerodrome first — that step is gone; Aerodrome is mainnet-only
 * and USDbC liquidity was thin anyway (see workdone.md).
 *
 * The final `ship` step uses *planned* amounts; call
 * `plan.balancedShipStep(realAUsdc, realAUsdbc)` after the supplies land to ship
 * the exact post-supply balances dust-free.
 */
import { encodeFunctionData, type Address, type Hex } from 'viem';
import {
  USDC, USDbC, aUSDC, aUSDbC, AAVE_POOL, AQUA, AQUA_SWAP_VM_ROUTER, MAX_UINT256, CHAIN_ID,
  ERC20_ABI, AAVE_POOL_ABI, AQUA_ABI,
} from './constants';
import { buildPeggedStrategy, type BuiltStrategy, type PegBandPercent, type PegBandPreset } from './strategy';
import type { TxStep, TokenLeg } from './types';

const LEG_B_SYMBOL = CHAIN_ID === 84532 ? 'USDT' : 'USDbC';

const USDC_LEG: TokenLeg = { token: USDC, aToken: aUSDC, decimals: 6 };
const USDBC_LEG: TokenLeg = { token: USDbC, aToken: aUSDbC, decimals: 6 };

export interface DepositInput {
  user: Address;
  /** leg-A stablecoin (USDC) to deposit, 6-decimal base units */
  usdcAmount: bigint;
  /** leg-B stablecoin (USDbC on mainnet, USDT on Sepolia), 6-decimal base units.
   *  Defaults to `usdcAmount` (a balanced 1:1 deposit). */
  usdbcAmount?: bigint;
  /** ±% peg band, or a preset ("tight" | "balanced" | "wide"). Default "balanced". */
  pegBand?: PegBandPercent | PegBandPreset;
  /** maker/LP fee (bps) on amountIn. Default 0 — see the warning on `PeggedStrategyInput.makerFeeBps`. */
  makerFeeBps?: number;
  /** strategy salt; defaults to random so re-deposits never collide */
  salt?: bigint;
}

export interface DepositPlan {
  strategy: BuiltStrategy;
  strategyHash: Hex;
  legs: { usdc: TokenLeg; usdbc: TokenLeg };
  /** amounts baked into `steps` (aToken units ≈ underlying, 6dp) */
  planned: { supplyUsdc: bigint; supplyUsdbc: bigint; shipAUsdc: bigint; shipAUsdbc: bigint };
  /** ordered txs to sign; steps before `shipStepIndex` are exact */
  steps: TxStep[];
  shipStepIndex: number;
  /** rebuild ONLY the ship step with explicit per-leg amounts */
  shipStep(aUsdcAmount: bigint, aUsdbcAmount: bigint): TxStep;
  /**
   * Rebuild the ship step with a *balanced* pool: ships `min(realAUsdc, realAUsdbc)`
   * on both legs so the pegged curve starts at 1:1. The small remainder on the
   * heavier leg stays in the wallet — still an Aave-earning aToken, just not in
   * the Aqua position.
   */
  balancedShipStep(realAUsdc: bigint, realAUsdbc: bigint): { step: TxStep; shipped: bigint; remainder: { token: 'aUSDC' | 'aUSDbC'; amount: bigint } };
}

const approve = (token: Address, spender: Address, amount: bigint): Hex =>
  encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [spender, amount] });

const supply = (asset: Address, amount: bigint, onBehalfOf: Address): Hex =>
  encodeFunctionData({ abi: AAVE_POOL_ABI, functionName: 'supply', args: [asset, amount, onBehalfOf, 0] });

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
  const usdbcAmount = input.usdbcAmount ?? usdcAmount;
  if (usdcAmount <= 0n || usdbcAmount <= 0n) throw new Error('both deposit amounts must be positive');

  // Plan a balanced pool: the pegged curve is symmetric (x0 == y0) so it starts
  // exactly at 1:1. Ship the smaller of the two; the remainder on the heavier
  // leg stays in-wallet as an Aave-earning aToken.
  const shipAUsdc = usdcAmount < usdbcAmount ? usdcAmount : usdbcAmount;
  const shipAUsdbc = shipAUsdc;

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
    { label: 'Approve USDC for Aave', to: USDC, data: approve(USDC, AAVE_POOL, usdcAmount) },
    { label: 'Supply USDC to Aave', to: AAVE_POOL, data: supply(USDC, usdcAmount, user) },
    { label: `Approve ${LEG_B_SYMBOL} for Aave`, to: USDbC, data: approve(USDbC, AAVE_POOL, usdbcAmount) },
    { label: `Supply ${LEG_B_SYMBOL} to Aave`, to: AAVE_POOL, data: supply(USDbC, usdbcAmount, user) },
    { label: 'Approve aUSDC for Aqua', to: aUSDC, data: approve(aUSDC, AQUA, MAX_UINT256) },
    { label: `Approve a${LEG_B_SYMBOL} for Aqua`, to: aUSDbC, data: approve(aUSDbC, AQUA, MAX_UINT256) },
    { label: 'Ship strategy to Aqua', to: AQUA, data: shipCalldata(strategy, shipAUsdc, shipAUsdbc) },
  ];

  return {
    strategy,
    strategyHash: strategy.strategyHash,
    legs: { usdc: USDC_LEG, usdbc: USDBC_LEG },
    planned: { supplyUsdc: usdcAmount, supplyUsdbc: usdbcAmount, shipAUsdc, shipAUsdbc },
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

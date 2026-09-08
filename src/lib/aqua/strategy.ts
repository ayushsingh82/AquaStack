/**
 * Module 2 — turn one risk knob (peg-band width) into a shippable Aqua pegged
 * AMM strategy.
 *
 * The pegged curve runs on Aqua's *virtual* balances, so `reserveA/reserveB`
 * here are the amounts we intend to `ship()`. Aave rebase yield accrues on the
 * real aTokens in the maker wallet and is invisible to this curve
 * (proven in Phase 0, item 3).
 */
import { keccak256, getAddress, type Address, type Hex } from 'viem';
import { Address as SdkAddress } from '@1inch/sdk-core';
import {
  AquaPeggedAmmStrategy, Order, MakerTraits, instructions,
} from '@1inch/swap-vm-sdk';
import type { OrderTuple } from './types';

/** ±band as a human percent, e.g. 0.5 → ±0.50 %. */
export type PegBandPercent = number;

/** Named presets for the one risk knob. Higher band = safer vs depeg, less fee capture. */
export const PEG_BAND_PRESETS = {
  tight: 0.1,
  balanced: 0.5,
  wide: 2.0,
} as const;
export type PegBandPreset = keyof typeof PEG_BAND_PRESETS;

export function resolvePegBand(risk: PegBandPercent | PegBandPreset): PegBandPercent {
  const band = typeof risk === 'number' ? risk : PEG_BAND_PRESETS[risk];
  if (!(band > 0) || band >= 50) throw new Error(`peg band must be in (0, 50) percent, got ${band}`);
  return band;
}

export interface PeggedStrategyInput {
  /** lower-address leg's aToken + decimals */
  aTokenA: Address;
  decimalsA: number;
  /** higher-address leg's aToken + decimals */
  aTokenB: Address;
  decimalsB: number;
  /** amounts to ship as Aqua virtual liquidity (aToken units) */
  reserveA: bigint;
  reserveB: bigint;
  /** ±% band around the peg, or a preset name. Default "balanced" (±0.5%). */
  pegBand?: PegBandPercent | PegBandPreset;
  /**
   * fee (bps) on amountIn kept by the maker/LP. **Default 0.**
   * ⚠️ Phase 1 finding: `withFeeTokenIn()` on a pegged Aqua strategy makes the
   * on-chain `swap()` revert (quote still works). Leave at 0 until resolved —
   * the pegged band itself already captures a spread for the LP.
   */
  makerFeeBps?: number;
  /** strategy uniqueness — defaults to a random uint64 salt so re-deposits never collide */
  salt?: bigint;
}

export interface BuiltStrategy {
  /** SDK Order object (for quote/swap encoding downstream) */
  order: Order;
  /** ABI-ready `(maker, traits, data)` tuple for router.hash / quote / swap */
  orderTuple: OrderTuple;
  /** `order.encode()` — the exact bytes passed to `aqua.ship(app, strategy, …)` */
  strategyBytes: Hex;
  /** `keccak256(strategyBytes)` — the id used everywhere (rawBalances, dock, events) */
  strategyHash: Hex;
  /** encoded SwapVM program bytecode */
  program: Hex;
  pegBand: PegBandPercent;
  salt: bigint;
}

function randomSalt(): bigint {
  // SwapVM's Salt instruction takes a uint64
  const b = crypto.getRandomValues(new Uint8Array(8));
  return BigInt('0x' + Buffer.from(b).toString('hex'));
}

export function buildPeggedStrategy(maker: Address, input: PeggedStrategyInput): BuiltStrategy {
  const pegBand = resolvePegBand(input.pegBand ?? 'balanced');
  const salt = input.salt ?? randomSalt();
  const linearWidth = instructions.peggedSwap.linearWidthFromSymmetricRangePercent(pegBand);

  let strat = AquaPeggedAmmStrategy.new({
    tokenA: { address: new SdkAddress(input.aTokenA), decimals: input.decimalsA, reserve: input.reserveA },
    tokenB: { address: new SdkAddress(input.aTokenB), decimals: input.decimalsB, reserve: input.reserveB },
    linearWidth,
  }).withSalt(salt);

  const feeBps = input.makerFeeBps ?? 0;
  if (feeBps > 0) strat = strat.withFeeTokenIn(feeBps);

  const program = strat.build();
  const order = Order.new({ maker: new SdkAddress(maker), traits: MakerTraits.default(), program });

  const rb = order.build();
  const orderTuple: OrderTuple = {
    maker: getAddress(rb.maker.toString()),
    traits: BigInt(rb.traits),
    data: rb.data.toString() as Hex,
  };
  const strategyBytes = order.encode().toString() as Hex;

  return {
    order,
    orderTuple,
    strategyBytes,
    strategyHash: keccak256(strategyBytes),
    program: program.toString() as Hex,
    pegBand,
    salt,
  };
}

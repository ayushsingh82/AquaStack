import type { Address, Hex } from 'viem';

/** One transaction the caller must sign, in order. */
export interface TxStep {
  /** human label for a progress UI */
  label: string;
  to: Address;
  data: Hex;
  value?: bigint;
}

/** ABI-ready Order tuple `(maker, traits, data)` for router.hash / quote / swap. */
export interface OrderTuple {
  maker: Address;
  traits: bigint;
  data: Hex;
}

export interface TokenLeg {
  /** underlying stablecoin (e.g. USDC) */
  token: Address;
  /** Aave aToken for that stablecoin (e.g. aBasUSDC) */
  aToken: Address;
  decimals: number;
}

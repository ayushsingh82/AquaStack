/**
 * Base-mainnet addresses + ABIs for the AquaLadder integration layer.
 *
 * Aave v3 Base does NOT list USDT, so the pegged pair is aUSDC / aUSDbC
 * (both active, unfrozen — confirmed in Phase 0, see ../../../workdone.md).
 */
import { parseAbi, getAddress } from 'viem';
import * as aquaSdk from '@1inch/aqua-sdk';
import * as vmSdk from '@1inch/swap-vm-sdk';

export const BASE_CHAIN_ID = 8453 as const;

// 1inch Aqua — same address on every supported chain
export const AQUA = getAddress(aquaSdk.AQUA_CONTRACT_ADDRESSES[BASE_CHAIN_ID].toString());
export const AQUA_SWAP_VM_ROUTER = getAddress(vmSdk.AQUA_SWAP_VM_CONTRACT_ADDRESSES[BASE_CHAIN_ID].toString());

// Stablecoins (6 decimals)
export const USDC = getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
export const USDbC = getAddress('0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA');

// Aave v3 (Base)
export const AAVE_POOL = getAddress('0xA238Dd80C259a72e81d7e4664a9801593F98d1c5');
export const aUSDC = getAddress('0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB');
export const aUSDbC = getAddress('0x0a1d576f3eFeF75b330424287a95A366e8281D54');

// Aerodrome (Base) — used for the USDC -> USDbC half-swap.
// Its stable-pool curve handles stable<>stable far better than a Uniswap v3
// concentrated pool, and it holds the deepest remaining USDbC liquidity.
// NOTE (Phase 1 finding): USDbC liquidity on Base is thin everywhere
// (~15k USDC in the Aerodrome stable pool). Large deposits will slip; a
// production build should pair aUSDC with a deeper asset or mint the second
// leg via an Aave borrow-loop instead of a DEX swap. See workdone.md.
export const AERODROME_ROUTER = getAddress('0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43');
export const AERODROME_FACTORY = getAddress('0x420DD381b31aEf6683db6B902084cB0FFECe40Da');

export const MAX_UINT256 = 2n ** 256n - 1n;

export const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]);

export const AAVE_POOL_ABI = parseAbi([
  'function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)',
  'function withdraw(address asset,uint256 amount,address to) returns (uint256)',
  'function getReserveNormalizedIncome(address asset) view returns (uint256)',
]);

export const AERODROME_ROUTER_ABI = parseAbi([
  'struct Route { address from; address to; bool stable; address factory; }',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] routes, address to, uint256 deadline) returns (uint256[] amounts)',
  'function getAmountsOut(uint256 amountIn, Route[] routes) view returns (uint256[] amounts)',
]);

export const AQUA_ABI = aquaSdk.ABI.AQUA_ABI;
export const SWAP_VM_ABI = vmSdk.ABI.SWAP_VM_ABI;

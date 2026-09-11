/**
 * Addresses + ABIs for the AquaStack integration layer (server-only).
 *
 * Switched by NEXT_PUBLIC_CHAIN_ID:
 *   8453  Base mainnet   — Aqua/Router from the SDK maps; pegged pair aUSDC / aUSDbC
 *   84532 Base Sepolia   — Aqua/Router deployed by us (from env); pegged pair aUSDC / aUSDT
 *
 * "USDbC / aUSDbC" here mean "leg B" — on Sepolia that leg is USDT.
 */
import { parseAbi, getAddress, type Address } from 'viem';
import * as aquaSdk from '@1inch/aqua-sdk';
import * as vmSdk from '@1inch/swap-vm-sdk';

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 8453);
export const BASE_CHAIN_ID = 8453 as const;
const IS_SEPOLIA = CHAIN_ID === 84532;

const env = (k: string): string | undefined => process.env[k] || undefined;

// 1inch Aqua — deterministic on every mainnet; on Sepolia we deploy it ourselves.
export const AQUA: Address = IS_SEPOLIA
  ? getAddress(env('NEXT_PUBLIC_AQUA') ?? '0x0000000000000000000000000000000000000000')
  : getAddress(aquaSdk.AQUA_CONTRACT_ADDRESSES[BASE_CHAIN_ID].toString());
export const AQUA_SWAP_VM_ROUTER: Address = IS_SEPOLIA
  ? getAddress(env('NEXT_PUBLIC_AQUA_SWAP_VM_ROUTER') ?? '0x0000000000000000000000000000000000000000')
  : getAddress(vmSdk.AQUA_SWAP_VM_CONTRACT_ADDRESSES[BASE_CHAIN_ID].toString());

const ADDR = IS_SEPOLIA
  ? {
      USDC: '0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f',
      USDbC: '0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a', // USDT
      AAVE_POOL: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
      AAVE_DATA_PROVIDER: '0xBc9f5b7E248451CdD7cA54e717a2BFe1F32b566b',
      aUSDC: '0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC',
      aUSDbC: '0xcE3CAae5Ed17A7AafCEEbc897DE843fA6CC0c018', // aUSDT
    }
  : {
      USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
      AAVE_POOL: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
      AAVE_DATA_PROVIDER: '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac',
      aUSDC: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',
      aUSDbC: '0x0a1d576f3eFeF75b330424287a95A366e8281D54',
    };

// Stablecoins (6 decimals)
export const USDC = getAddress(ADDR.USDC);
export const USDbC = getAddress(ADDR.USDbC);

// Aave v3
export const AAVE_POOL = getAddress(ADDR.AAVE_POOL);
export const AAVE_DATA_PROVIDER = getAddress(ADDR.AAVE_DATA_PROVIDER);
export const aUSDC = getAddress(ADDR.aUSDC);
export const aUSDbC = getAddress(ADDR.aUSDbC);

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
  'function repayWithATokens(address asset,uint256 amount,uint256 interestRateMode) returns (uint256)',
  'function getReserveNormalizedIncome(address asset) view returns (uint256)',
]);

export const AAVE_DATA_PROVIDER_ABI = parseAbi([
  'function getUserReserveData(address asset,address user) view returns (uint256 currentATokenBalance,uint256 currentStableDebt,uint256 currentVariableDebt,uint256 principalStableDebt,uint256 scaledVariableDebt,uint256 stableBorrowRate,uint256 liquidityRate,uint40 stableRateLastUpdated,bool usageAsCollateralEnabled)',
]);

export const AERODROME_ROUTER_ABI = parseAbi([
  'struct Route { address from; address to; bool stable; address factory; }',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, Route[] routes, address to, uint256 deadline) returns (uint256[] amounts)',
  'function getAmountsOut(uint256 amountIn, Route[] routes) view returns (uint256[] amounts)',
]);

export const AQUA_ABI = aquaSdk.ABI.AQUA_ABI;
export const SWAP_VM_ABI = vmSdk.ABI.SWAP_VM_ABI;

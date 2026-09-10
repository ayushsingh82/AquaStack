/** Client-safe addresses (no SDK imports — usable in Client Components).
 *  Switched by NEXT_PUBLIC_CHAIN_ID: 8453 = Base mainnet, 84532 = Base Sepolia.
 *  The "USDbC / aUSDbC" names mean "leg B" — on Sepolia that leg is USDT. */
import type { Address } from 'viem';

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 8453);

const SETS: Record<number, { USDC: string; USDbC: string; aUSDC: string; aUSDbC: string; AAVE_POOL: string }> = {
  // Base mainnet — aUSDC / aUSDbC
  8453: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    aUSDC: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',
    aUSDbC: '0x0a1d576f3eFeF75b330424287a95A366e8281D54',
    AAVE_POOL: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
  },
  // Base Sepolia — Aave v3 test market, leg B = USDT
  84532: {
    USDC: '0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f',
    USDbC: '0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a', // USDT
    aUSDC: '0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC',
    aUSDbC: '0xcE3CAae5Ed17A7AafCEEbc897DE843fA6CC0c018', // aUSDT
    AAVE_POOL: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
  },
};

const A = SETS[CHAIN_ID] ?? SETS[8453];

export const USDC = A.USDC as Address;
export const USDbC = A.USDbC as Address;
export const aUSDC = A.aUSDC as Address;
export const aUSDbC = A.aUSDbC as Address;
export const AAVE_POOL = A.AAVE_POOL as Address;

export const ACCENT = '#FD5299';
